import { XMLParser } from "fast-xml-parser";
import { config } from "./config";
import { stripTags, toPubMedDate } from "./format";
import type { BriefingItem, TopicProfile } from "./types";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const SEARCH_RETMAX = 50;
const FETCH_LIMIT = 40;
const RESULT_LIMIT = 10;
const MIN_STRICT_ITEMS = 3;

let lastNcbiRequestAt = 0;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function arrayify<T>(value: T | T[] | undefined | null): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record["#text"] ?? Object.values(record).join(" "));
  }
  return "";
}

const ORIGINAL_PUBLICATION_TYPES = [
  "Journal Article",
  "Clinical Trial",
  "Controlled Clinical Trial",
  "Randomized Controlled Trial",
  "Observational Study",
  "Comparative Study",
  "Multicenter Study",
  "Evaluation Study",
  "Validation Study",
  "Clinical Trial, Phase I",
  "Clinical Trial, Phase II",
  "Clinical Trial, Phase III",
  "Clinical Trial, Phase IV",
] as const;

const REVIEW_PUBLICATION_TYPES = ["Review", "Systematic Review", "Meta-Analysis"] as const;

const EXCLUDED_PUBLICATION_TYPES = [
  "Editorial",
  "Letter",
  "Comment",
  "News",
  "Case Reports",
  "Published Erratum",
  "Retraction of Publication",
  "Retracted Publication",
  "Practice Guideline",
  "Guideline",
  "Biography",
  "Interview",
  "Historical Article",
  "Congresses",
] as const;

const ALLOWED_PUBLICATION_TYPE_SET = new Set(
  [...ORIGINAL_PUBLICATION_TYPES, ...REVIEW_PUBLICATION_TYPES].map(normalizePublicationType),
);

const EXCLUDED_PUBLICATION_TYPE_SET = new Set(
  EXCLUDED_PUBLICATION_TYPES.map(normalizePublicationType),
);

const REVIEW_PUBLICATION_TYPE_SET = new Set(
  REVIEW_PUBLICATION_TYPES.map(normalizePublicationType),
);

function normalizePublicationType(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function publicationTypeClause(types: readonly string[]) {
  return `(${types.map((type) => `"${type}"[Publication Type]`).join(" OR ")})`;
}

function buildAllowedPublicationTypeClause() {
  return publicationTypeClause([...ORIGINAL_PUBLICATION_TYPES, ...REVIEW_PUBLICATION_TYPES]);
}

function buildExcludedPublicationTypeClause() {
  return publicationTypeClause(EXCLUDED_PUBLICATION_TYPES);
}

function readPublicationTypes(article: Record<string, unknown>) {
  const publicationTypes = arrayify(
    (article.PublicationTypeList as Record<string, unknown> | undefined)?.PublicationType,
  );

  return publicationTypes.map(textValue).filter(Boolean);
}

function isAllowedPublicationType(publicationTypes: string[]) {
  const normalized = publicationTypes.map(normalizePublicationType);
  if (normalized.some((type) => EXCLUDED_PUBLICATION_TYPE_SET.has(type))) return false;
  return normalized.some((type) => ALLOWED_PUBLICATION_TYPE_SET.has(type));
}

function articleTypeTag(publicationTypes: string[]) {
  const normalized = publicationTypes.map(normalizePublicationType);
  return normalized.some((type) => REVIEW_PUBLICATION_TYPE_SET.has(type))
    ? "Review"
    : "Original Article";
}

function buildJournalClause(journals: string[]) {
  return journals.map((journal) => `"${journal}"[Journal]`).join(" OR ");
}

function buildRecentDateClause(startDate: Date, endDate: Date) {
  const start = toPubMedDate(startDate);
  const end = toPubMedDate(endDate);
  const fields = ["Date - Publication", "Date - Entrez", "Date - Create"];
  return `(${fields.map((field) => `("${start}"[${field}] : "${end}"[${field}])`).join(" OR ")})`;
}

function buildTopicClause(topic: TopicProfile) {
  const termParts = topic.terms.map((term) => `"${term}"[Title/Abstract]`);
  const meshParts = topic.meshTerms.map((term) => `"${term}"[MeSH Terms]`);
  return [...termParts, ...meshParts].join(" OR ");
}

function buildSearchTerm(
  topic: TopicProfile,
  startDate: Date,
  endDate: Date,
  strictJournalFilter: boolean,
) {
  const topicClause = buildTopicClause(topic);
  const dateClause = buildRecentDateClause(startDate, endDate);
  const allowedTypes = buildAllowedPublicationTypeClause();
  const excludedTypes = buildExcludedPublicationTypeClause();

  if (!strictJournalFilter) {
    return `(${topicClause}) AND ${dateClause} AND ${allowedTypes} NOT ${excludedTypes}`;
  }

  return `(${topicClause}) AND ${dateClause} AND (${buildJournalClause(
    topic.highImpactJournals,
  )}) AND ${allowedTypes} NOT ${excludedTypes}`;
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }

  return 750 * 2 ** attempt;
}

function shouldRetryNcbiStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function waitForNcbiSlot() {
  const interval = config.ncbiApiKey ? 120 : 380;
  const elapsed = Date.now() - lastNcbiRequestAt;
  if (elapsed < interval) {
    await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
  }
  lastNcbiRequestAt = Date.now();
}

async function ncbiFetch(url: URL) {
  if (config.ncbiEmail) url.searchParams.set("email", config.ncbiEmail);
  if (config.ncbiTool) url.searchParams.set("tool", config.ncbiTool);
  if (config.ncbiApiKey) url.searchParams.set("api_key", config.ncbiApiKey);

  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForNcbiSlot();
    const nextResponse = await fetch(url, {
      headers: {
        "User-Agent": `${config.ncbiTool}/1.0 (${config.ncbiEmail || "no-email-configured"})`,
      },
      next: { revalidate: 0 },
    });
    response = nextResponse;

    if (nextResponse.ok || !shouldRetryNcbiStatus(nextResponse.status) || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(nextResponse, attempt)));
  }

  if (!response) {
    throw new Error("NCBI request failed: no response");
  }

  if (!response.ok) {
    throw new Error(`NCBI request failed: ${response.status} ${response.statusText}`);
  }

  return response;
}

async function searchIds(topic: TopicProfile, startDate: Date, endDate: Date, strict: boolean) {
  const url = new URL(`${BASE_URL}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(SEARCH_RETMAX));
  url.searchParams.set("sort", "pub date");
  url.searchParams.set("term", buildSearchTerm(topic, startDate, endDate, strict));

  const response = await ncbiFetch(url);
  const payload = (await response.json()) as {
    esearchresult?: { idlist?: string[] };
  };

  return payload.esearchresult?.idlist ?? [];
}

function readPubDate(article: Record<string, unknown>) {
  const journal = article.Journal as Record<string, unknown> | undefined;
  const issue = journal?.JournalIssue as Record<string, unknown> | undefined;
  const pubDate = issue?.PubDate as Record<string, unknown> | undefined;
  const year = textValue(pubDate?.Year);
  const month = textValue(pubDate?.Month);
  const day = textValue(pubDate?.Day);

  if (!year) return null;

  const monthMap: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const normalizedMonth =
    monthMap[month] ?? (month ? String(Number(month)).padStart(2, "0") : "01");
  const normalizedDay = day ? String(Number(day)).padStart(2, "0") : "01";
  return `${year}-${normalizedMonth}-${normalizedDay}`;
}

function readDoi(pubmedData: Record<string, unknown> | undefined) {
  const ids = arrayify(
    (pubmedData?.ArticleIdList as Record<string, unknown> | undefined)?.ArticleId,
  ) as Record<string, unknown>[];

  const doi = ids.find((id) => String(id["@_IdType"] ?? "").toLowerCase() === "doi");
  return textValue(doi?.["#text"] ?? doi) || null;
}

function readAuthors(article: Record<string, unknown>) {
  const authors = arrayify(
    (article.AuthorList as Record<string, unknown> | undefined)?.Author,
  ) as Record<string, unknown>[];

  return authors
    .map((author) => {
      const collective = textValue(author.CollectiveName);
      if (collective) return collective;
      const last = textValue(author.LastName);
      const initials = textValue(author.Initials);
      return [last, initials].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .slice(0, 12);
}

function parseArticle(pubmedArticle: Record<string, unknown>, topic: TopicProfile): BriefingItem {
  const citation = pubmedArticle.MedlineCitation as Record<string, unknown>;
  const article = citation.Article as Record<string, unknown>;
  const pubmedData = pubmedArticle.PubmedData as Record<string, unknown> | undefined;
  const pmid = textValue(citation.PMID);
  const journal = article.Journal as Record<string, unknown> | undefined;
  const abstractRecord = article.Abstract as Record<string, unknown> | undefined;
  const abstract = stripTags(textValue(abstractRecord?.AbstractText));
  const title = stripTags(textValue(article.ArticleTitle));
  const sourceName =
    textValue(journal?.Title) || textValue(journal?.ISOAbbreviation) || "PubMed";
  const doi = readDoi(pubmedData);
  const publicationTypes = readPublicationTypes(article);

  return {
    topicSlug: topic.slug,
    kind: "paper",
    sourceId: pmid,
    title,
    sourceName,
    publishedAt: readPubDate(article),
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    doi,
    pmid,
    authors: readAuthors(article),
    abstract,
    snippet: abstract.slice(0, 420),
    tags: [topic.name, "PubMed", articleTypeTag(publicationTypes)],
    importance: topic.highImpactJournals.includes(sourceName) ? "high" : "medium",
    raw: pubmedArticle,
  };
}

async function fetchDetails(ids: string[], topic: TopicProfile) {
  if (ids.length === 0) return [];

  const url = new URL(`${BASE_URL}/efetch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "xml");
  url.searchParams.set("id", ids.join(","));

  const response = await ncbiFetch(url);
  const xml = await response.text();
  const parsed = parser.parse(xml) as {
    PubmedArticleSet?: { PubmedArticle?: Record<string, unknown> | Record<string, unknown>[] };
  };
  const articles = arrayify(parsed.PubmedArticleSet?.PubmedArticle);

  return articles.flatMap((article) => {
    const citation = article.MedlineCitation as Record<string, unknown> | undefined;
    const medlineArticle = citation?.Article as Record<string, unknown> | undefined;
    if (!medlineArticle || !isAllowedPublicationType(readPublicationTypes(medlineArticle))) {
      return [];
    }

    return [parseArticle(article, topic)];
  });
}

export async function fetchPubMedForTopic(
  topic: TopicProfile,
  startDate: Date,
  endDate: Date,
) {
  const strictIds = await searchIds(topic, startDate, endDate, true);
  const strictItems = (await fetchDetails(strictIds.slice(0, FETCH_LIMIT), topic)).map((item) => ({
    ...item,
    raw: { ...(item.raw as Record<string, unknown>), searchMode: "strict" },
  }));

  if (strictItems.length >= MIN_STRICT_ITEMS) {
    return strictItems.slice(0, RESULT_LIMIT);
  }

  const fallbackIds = await searchIds(topic, startDate, endDate, false);
  const fallbackOnlyIds = fallbackIds.filter((id) => !strictIds.includes(id));
  const fallbackItems = (
    await fetchDetails(fallbackOnlyIds.slice(0, FETCH_LIMIT), topic)
  ).map((item) => ({
    ...item,
    raw: { ...(item.raw as Record<string, unknown>), searchMode: "fallback" },
  }));

  const seen = new Set<string>();
  return [...strictItems, ...fallbackItems]
    .filter((item) => {
      if (seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    })
    .slice(0, RESULT_LIMIT);
}
