import { config } from "./config";

export type ThesisKeyJournalSection = "method" | "results" | "discussion";
export type ThesisKeyJournalSearchWindow = "recent-10y" | "all-time";

export type ThesisKeyJournalInput = {
  title: string;
  type: string;
  targetJournal?: string;
  centralClaim?: string;
  nextAction?: string;
  researchContext?: string;
};

export type ThesisKeyJournalCandidate = {
  id: string;
  section: ThesisKeyJournalSection;
  title: string;
  journal: string;
  year: string;
  publishedAt: string | null;
  url: string;
  authors: string[];
  score: number;
  impactScore: number;
  impactLabel: string;
  rationale: string;
  searchMode: "target-journal" | "broad";
  searchWindow: ThesisKeyJournalSearchWindow;
};

export type ThesisKeyJournalSectionResult = {
  section: ThesisKeyJournalSection;
  label: string;
  query: string;
  pubmedUrl: string;
  searchWindow: ThesisKeyJournalSearchWindow;
  fallbackApplied: boolean;
  candidates: ThesisKeyJournalCandidate[];
};

export type ThesisKeyJournalSearchResult = {
  searchedAt: string;
  domainTerms: string[];
  requiredTerms: string[];
  targetJournals: string[];
  sections: ThesisKeyJournalSectionResult[];
};

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const RETMAX = 18;
const DAYS_BACK = 3650;
const RESULT_LIMIT = 6;

let lastNcbiRequestAt = 0;

const sectionLabels: Record<ThesisKeyJournalSection, string> = {
  method: "Methods",
  results: "Results",
  discussion: "Discussion",
};

const excludedPublicationTypes = [
  "Editorial",
  "Letter",
  "Comment",
  "News",
  "Case Reports",
  "Published Erratum",
  "Retraction of Publication",
  "Retracted Publication",
];

const commonStopWords = new Set([
  "and",
  "with",
  "from",
  "study",
  "analysis",
  "clinical",
  "experimental",
  "model",
  "models",
  "project",
  "thesis",
  "paper",
  "file",
  "files",
  "data",
  "docx",
  "xlsx",
  "hyun",
  "plan",
  "references",
  "new",
  "the",
]);

const defaultHighImpactJournalsByType: Record<string, string[]> = {
  experimental: [
    "Nature",
    "Science",
    "Cell",
    "Nature Biomedical Engineering",
    "Nature Communications",
    "Science Translational Medicine",
    "Advanced Science",
    "Biomaterials",
    "Acta Biomaterialia",
    "Journal of Controlled Release",
  ],
  clinical: [
    "The Lancet Neurology",
    "JAMA Neurology",
    "Nature Medicine",
    "Brain",
    "Annals of Neurology",
    "Neurology",
    "Neurorehabilitation and Neural Repair",
    "Brain Stimulation",
  ],
  ai_ml: [
    "Nature Medicine",
    "Nature Biomedical Engineering",
    "npj Digital Medicine",
    "The Lancet Digital Health",
    "Medical Image Analysis",
    "IEEE Transactions on Medical Imaging",
    "Journal of Biomedical Informatics",
  ],
  meta_analysis: [
    "Nature Reviews Neurology",
    "The Lancet Neurology",
    "JAMA Neurology",
    "BMJ",
    "Annals of Internal Medicine",
    "Cochrane Database of Systematic Reviews",
  ],
  review: [
    "Nature Reviews Neurology",
    "The Lancet Neurology",
    "Nature Reviews Neuroscience",
    "Trends in Neurosciences",
    "Progress in Neurobiology",
  ],
  unknown: [
    "Nature",
    "Science",
    "Cell",
    "Nature Medicine",
    "Nature Communications",
    "Advanced Science",
  ],
};

const domainPatterns: Array<{ pattern: RegExp; terms: string[] }> = [
  {
    pattern: /\b(sci|spinal|cord|transection|gabapentin|gabapentinoid|pregabalin|scaffold|hydrogel|tscs|epidural)\b/i,
    terms: ["spinal cord injury", "neural repair", "neurorehabilitation"],
  },
  {
    pattern: /\b(gabapentin|gabapentinoid|pregabalin)\b/i,
    terms: ["gabapentin", "pregabalin", "alpha2delta", "axon regeneration"],
  },
  {
    pattern: /\b(scaffold|hydrogel|transection|porcine)\b/i,
    terms: ["scaffold", "hydrogel", "spinal cord transection", "biomaterial"],
  },
  {
    pattern: /\b(sarcopenia|muscle|frailty|cachexia)\b/i,
    terms: ["sarcopenia", "skeletal muscle", "frailty", "muscle function"],
  },
  {
    pattern: /\b(bci|eeg|emg|prosthesis|neural interface|brain-computer)\b/i,
    terms: ["brain-computer interface", "neural interface", "neuroprosthetics", "EEG"],
  },
  {
    pattern: /\b(stroke|tbi|seizure|dti|rtms)\b/i,
    terms: ["stroke", "traumatic brain injury", "seizure", "neuroimaging"],
  },
  {
    pattern: /\b(machine learning|ml|ai|prediction|deep learning|single cell)\b/i,
    terms: ["machine learning", "prediction model", "external validation", "single-cell analysis"],
  },
];

const requiredTermPatterns: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\b(gabapentin|gabapentinoid|pregabalin)\b/i, terms: ["gabapentin", "pregabalin", "gabapentinoid"] },
  { pattern: /\b(scaffold|hydrogel|transection)\b/i, terms: ["scaffold", "hydrogel", "transection"] },
  { pattern: /\b(tscs|epidural stimulation|stimulation)\b/i, terms: ["transcutaneous spinal cord stimulation", "epidural stimulation"] },
  { pattern: /\b(single cell|single-cell)\b/i, terms: ["single-cell", "single cell"] },
  { pattern: /\b(sarcopenia)\b/i, terms: ["sarcopenia"] },
  { pattern: /\b(stroke)\b/i, terms: ["stroke"] },
  { pattern: /\b(tbi|traumatic brain injury)\b/i, terms: ["traumatic brain injury", "TBI"] },
  { pattern: /\b(dti)\b/i, terms: ["diffusion tensor imaging", "DTI"] },
  { pattern: /\b(rtms)\b/i, terms: ["repetitive transcranial magnetic stimulation", "rTMS"] },
  { pattern: /\b(eeg|emg|prosthesis)\b/i, terms: ["EEG", "EMG", "prosthesis"] },
];

const typeSectionTerms: Record<string, Record<ThesisKeyJournalSection, string[]>> = {
  experimental: {
    method: ["animal model", "experimental design", "histology", "immunohistochemistry", "behavioral assessment"],
    results: ["functional recovery", "axon regeneration", "biomarker", "mechanism", "treatment effect"],
    discussion: ["translation", "mechanism", "limitation", "preclinical", "therapeutic strategy"],
  },
  clinical: {
    method: ["cohort", "endpoint", "prospective", "retrospective", "clinical trial", "statistical model"],
    results: ["outcome", "recovery", "risk factor", "predictor", "treatment response"],
    discussion: ["clinical implication", "prognosis", "guideline", "rehabilitation", "translation"],
  },
  ai_ml: {
    method: ["machine learning", "validation", "training", "test set", "external validation", "explainability"],
    results: ["AUC", "accuracy", "calibration", "prediction performance", "feature importance"],
    discussion: ["clinical utility", "model generalizability", "bias", "deployment", "decision support"],
  },
  meta_analysis: {
    method: ["systematic review", "meta-analysis", "PRISMA", "risk of bias", "search strategy"],
    results: ["pooled effect", "heterogeneity", "subgroup analysis", "sensitivity analysis"],
    discussion: ["certainty of evidence", "GRADE", "clinical implication", "research gap"],
  },
  review: {
    method: ["review", "scoping review", "evidence map", "search strategy"],
    results: ["mechanism", "classification", "therapeutic target", "evidence"],
    discussion: ["future direction", "clinical translation", "research gap", "limitation"],
  },
  unknown: {
    method: ["method", "cohort", "model", "validation", "experimental design"],
    results: ["outcome", "effect", "performance", "mechanism"],
    discussion: ["translation", "limitation", "clinical implication", "future direction"],
  },
};

type PubMedSummary = {
  uid: string;
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortpubdate?: string;
  authors?: Array<{ name?: string }>;
};

function unique(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function splitTargetJournals(value = "") {
  return unique(
    value
      .split(/[\/,;|]+/)
      .map((journal) => journal.replace(/\s+/g, " ").trim())
      .filter((journal) => journal.length > 2 && !/^target$/i.test(journal)),
  );
}

function normalizedType(value: string) {
  if (value === "clinical") return "clinical";
  if (value === "ai_ml") return "ai_ml";
  if (value === "meta_analysis") return "meta_analysis";
  if (value === "review") return "review";
  if (value === "experimental") return "experimental";
  return "unknown";
}

function inferTargetJournals(input: ThesisKeyJournalInput) {
  const type = normalizedType(input.type);
  return unique([
    ...splitTargetJournals(input.targetJournal),
    ...(defaultHighImpactJournalsByType[type] ?? defaultHighImpactJournalsByType.unknown),
  ]).slice(0, 14);
}

function titleTokens(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4 && !commonStopWords.has(token))
    .slice(0, 6);
}

function inputSearchText(input: ThesisKeyJournalInput) {
  return [
    input.title,
    input.centralClaim,
    input.nextAction,
    input.targetJournal,
    input.researchContext,
  ]
    .filter(Boolean)
    .join(" ");
}

function inferDomainTerms(input: ThesisKeyJournalInput) {
  const text = inputSearchText(input);
  const matched = domainPatterns.flatMap((pattern) => (pattern.pattern.test(text) ? pattern.terms : []));
  return unique([...matched, ...titleTokens(text)]).slice(0, 10);
}

function inferRequiredTerms(input: ThesisKeyJournalInput) {
  const text = inputSearchText(input);
  const matched = requiredTermPatterns.flatMap((pattern) => (pattern.pattern.test(text) ? pattern.terms : []));
  return unique(matched).slice(0, 5);
}

function phraseClause(values: string[], field: string) {
  return values.map((value) => `"${value}"[${field}]`).join(" OR ");
}

function publicationClause() {
  const allowed = [
    "Journal Article",
    "Clinical Trial",
    "Observational Study",
    "Validation Study",
    "Comparative Study",
    "Review",
    "Systematic Review",
    "Meta-Analysis",
  ];
  return `(${phraseClause(allowed, "Publication Type")}) NOT (${phraseClause(
    excludedPublicationTypes,
    "Publication Type",
  )})`;
}

function buildQuery(
  domainTerms: string[],
  requiredTerms: string[],
  sectionTerms: string[],
  targetJournals: string[],
  strictJournal: boolean,
) {
  const domainClause = phraseClause(domainTerms, "Title/Abstract");
  const requiredClause = requiredTerms.length > 0
    ? ` AND (${phraseClause(requiredTerms, "Title/Abstract")})`
    : "";
  const sectionClause = phraseClause(sectionTerms, "Title/Abstract");
  const journalClause = strictJournal && targetJournals.length > 0
    ? ` AND (${phraseClause(targetJournals, "Journal")})`
    : "";

  return `(${domainClause})${requiredClause} AND (${sectionClause}) AND ${publicationClause()}${journalClause}`;
}

function formatPubMedDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function dateWindowClause() {
  const startDate = new Date();
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 10);
  return `("${formatPubMedDate(startDate)}"[Date - Publication] : "3000"[Date - Publication])`;
}

function pubmedSearchUrl(query: string, searchWindow: ThesisKeyJournalSearchWindow) {
  const url = new URL("https://pubmed.ncbi.nlm.nih.gov/");
  const term = searchWindow === "recent-10y" ? `${query} AND ${dateWindowClause()}` : query;
  url.searchParams.set("term", term);
  url.searchParams.set("sort", "date");
  return url.toString();
}

async function waitForNcbiSlot() {
  const interval = config.ncbiApiKey ? 120 : 380;
  const elapsed = Date.now() - lastNcbiRequestAt;
  if (elapsed < interval) {
    await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
  }
  lastNcbiRequestAt = Date.now();
}

async function ncbiJson<T>(url: URL): Promise<T> {
  if (config.ncbiEmail) url.searchParams.set("email", config.ncbiEmail);
  if (config.ncbiTool) url.searchParams.set("tool", config.ncbiTool);
  if (config.ncbiApiKey) url.searchParams.set("api_key", config.ncbiApiKey);

  await waitForNcbiSlot();
  const response = await fetch(url, {
    headers: {
      "User-Agent": `${config.ncbiTool}/1.0 (${config.ncbiEmail || "no-email-configured"})`,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`NCBI request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function searchIds(query: string, searchWindow: ThesisKeyJournalSearchWindow) {
  const url = new URL(`${BASE_URL}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(RETMAX));
  url.searchParams.set("sort", "pub date");
  if (searchWindow === "recent-10y") {
    url.searchParams.set("datetype", "pdat");
    url.searchParams.set("reldate", String(DAYS_BACK));
  }
  url.searchParams.set("term", query);

  const payload = await ncbiJson<{ esearchresult?: { idlist?: string[] } }>(url);
  return payload.esearchresult?.idlist ?? [];
}

async function fetchSummaries(ids: string[]) {
  if (ids.length === 0) return [];
  const url = new URL(`${BASE_URL}/esummary.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("id", ids.join(","));

  const payload = await ncbiJson<{ result?: Record<string, PubMedSummary | string[]> }>(url);
  const result = payload.result ?? {};
  return ids
    .map((id) => result[id])
    .filter((record): record is PubMedSummary => Boolean(record) && typeof record === "object");
}

function publicationYear(record: PubMedSummary) {
  const source = record.sortpubdate || record.pubdate || "";
  const match = source.match(/\d{4}/);
  return match?.[0] ?? "";
}

function normalizedJournal(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const journalImpactScoreMap: Record<string, number> = {
  nature: 100,
  science: 100,
  cell: 100,
  "nature medicine": 98,
  "the lancet": 97,
  lancet: 97,
  "nature reviews neurology": 96,
  "nature reviews neuroscience": 96,
  jama: 95,
  "nature biomedical engineering": 94,
  "the lancet neurology": 93,
  "lancet neurology": 93,
  bmj: 92,
  "science translational medicine": 92,
  "jama neurology": 90,
  "cochrane database of systematic reviews": 90,
  brain: 88,
  "nature communications": 88,
  "annals of neurology": 86,
  "trends in neurosciences": 86,
  "the lancet digital health": 85,
  "progress in neurobiology": 84,
  "advanced science": 82,
  "npj digital medicine": 82,
  neurology: 80,
  "journal of controlled release": 78,
  "medical image analysis": 78,
  biomaterials: 76,
  "brain stimulation": 75,
  "ieee transactions on medical imaging": 74,
  "aging cell": 74,
  "journal of cachexia sarcopenia and muscle": 72,
  "acta biomaterialia": 70,
  "advanced healthcare materials": 70,
  "neurorehabilitation and neural repair": 70,
  "journal of biomedical informatics": 68,
  "cell reports": 66,
  "journal of neurotrauma": 58,
  "spinal cord": 55,
};

function journalImpactScore(journal: string) {
  const normalized = normalizedJournal(journal);
  if (!normalized) return 35;
  if (journalImpactScoreMap[normalized]) return journalImpactScoreMap[normalized];

  const matched = Object.entries(journalImpactScoreMap).find(
    ([key]) => normalized.includes(key) || key.includes(normalized),
  );
  return matched?.[1] ?? 40;
}

function journalImpactLabel(score: number) {
  if (score >= 90) return "top-tier";
  if (score >= 80) return "high-impact";
  if (score >= 70) return "strong specialty";
  if (score >= 55) return "field-relevant";
  return "impact proxy";
}

function scoreCandidate(
  record: PubMedSummary,
  section: ThesisKeyJournalSection,
  domainTerms: string[],
  sectionTerms: string[],
  targetJournals: string[],
  searchMode: "target-journal" | "broad",
) {
  const title = (record.title ?? "").toLowerCase();
  const journal = normalizedJournal(record.fulljournalname || record.source || "");
  const targetJournalSet = new Set(targetJournals.map(normalizedJournal));
  const impactScore = journalImpactScore(record.fulljournalname || record.source || "");
  let score = searchMode === "target-journal" ? 45 : 20;

  if (targetJournalSet.has(journal)) score += 25;
  score += Math.round(Math.min(12, impactScore / 8));
  score += Math.min(18, domainTerms.filter((term) => title.includes(term.toLowerCase())).length * 6);
  score += Math.min(15, sectionTerms.filter((term) => title.includes(term.toLowerCase())).length * 5);

  const year = Number(publicationYear(record));
  if (year >= 2025) score += 10;
  else if (year >= 2023) score += 6;
  else if (year >= 2021) score += 3;

  if (section === "discussion" && /review|meta-analysis|guideline/i.test(title)) score += 8;
  if (section === "method" && /validation|protocol|model|cohort|trial/i.test(title)) score += 8;
  if (section === "results" && /outcome|recovery|effect|performance|predict/i.test(title)) score += 8;

  return Math.min(100, score);
}

function rationaleFor(section: ThesisKeyJournalSection, searchMode: "target-journal" | "broad") {
  if (section === "method") {
    return searchMode === "target-journal"
      ? "Target/high-impact journal 안에서 method 설계, 실험·임상·AI 검증 구조를 먼저 비교합니다."
      : "Target journal 결과가 부족해 PubMed 전체에서 method 구조가 가까운 논문을 보강했습니다.";
  }
  if (section === "results") {
    return searchMode === "target-journal"
      ? "결과 지표, figure sequence, 통계 reporting 방식을 비교하기 위한 후보입니다."
      : "결과 해석과 endpoint 구성을 넓은 범위에서 보강하기 위한 후보입니다.";
  }
  return searchMode === "target-journal"
    ? "Discussion의 framing, limitation, translational angle을 맞추기 위한 후보입니다."
    : "Discussion에서 확장하기 좋은 mechanism, gap, future direction을 보강하기 위한 후보입니다.";
}

function toCandidate(
  record: PubMedSummary,
  section: ThesisKeyJournalSection,
  domainTerms: string[],
  sectionTerms: string[],
  targetJournals: string[],
  searchMode: "target-journal" | "broad",
  searchWindow: ThesisKeyJournalSearchWindow,
): ThesisKeyJournalCandidate {
  const pmid = record.uid;
  const journal = record.fulljournalname || record.source || "PubMed";
  const impactScore = journalImpactScore(journal);
  return {
    id: `${section}-${pmid}`,
    section,
    title: record.title ?? "Untitled PubMed record",
    journal,
    year: publicationYear(record),
    publishedAt: record.sortpubdate || record.pubdate || null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    authors: (record.authors ?? []).map((author) => author.name).filter(Boolean).slice(0, 6) as string[],
    score: scoreCandidate(record, section, domainTerms, sectionTerms, targetJournals, searchMode),
    impactScore,
    impactLabel: journalImpactLabel(impactScore),
    rationale: rationaleFor(section, searchMode),
    searchMode,
    searchWindow,
  };
}

function candidatePublishedTime(candidate: ThesisKeyJournalCandidate) {
  const parsed = Date.parse(candidate.publishedAt ?? candidate.year);
  if (Number.isFinite(parsed)) return parsed;
  const year = Number(candidate.year);
  return Number.isFinite(year) ? Date.UTC(year, 0, 1) : 0;
}

function compareCandidates(left: ThesisKeyJournalCandidate, right: ThesisKeyJournalCandidate) {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;

  const impactOrder = right.impactScore - left.impactScore;
  if (impactOrder !== 0) return impactOrder;

  return candidatePublishedTime(right) - candidatePublishedTime(left);
}

async function searchSection(
  section: ThesisKeyJournalSection,
  input: ThesisKeyJournalInput,
  domainTerms: string[],
  requiredTerms: string[],
  targetJournals: string[],
) {
  const type = normalizedType(input.type);
  const sectionTerms = typeSectionTerms[type]?.[section] ?? typeSectionTerms.unknown[section];
  const strictQuery = buildQuery(domainTerms, requiredTerms, sectionTerms, targetJournals, true);
  const broadQuery = buildQuery(domainTerms, requiredTerms, sectionTerms, targetJournals, false);

  async function searchWithinWindow(searchWindow: ThesisKeyJournalSearchWindow) {
    const strictIds = await searchIds(strictQuery, searchWindow);
    const strictCandidates = (await fetchSummaries(strictIds)).map((record) =>
      toCandidate(record, section, domainTerms, sectionTerms, targetJournals, "target-journal", searchWindow),
    );

    const broadIds = strictCandidates.length >= 3 ? [] : await searchIds(broadQuery, searchWindow);
    const strictUidSet = new Set(strictIds);
    const broadCandidates = (await fetchSummaries(broadIds.filter((id) => !strictUidSet.has(id)))).map((record) =>
      toCandidate(record, section, domainTerms, sectionTerms, targetJournals, "broad", searchWindow),
    );

    const seen = new Set<string>();
    const candidates = [...strictCandidates, ...broadCandidates]
      .sort(compareCandidates)
      .filter((candidate) => {
        if (seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      })
      .slice(0, RESULT_LIMIT);

    return {
      candidates,
      query: strictCandidates.length > 0 ? strictQuery : broadQuery,
      searchWindow,
    };
  }

  let result = await searchWithinWindow("recent-10y");
  if (result.candidates.length === 0) {
    result = await searchWithinWindow("all-time");
  }

  return {
    section,
    label: sectionLabels[section],
    query: result.query,
    pubmedUrl: pubmedSearchUrl(result.query, result.searchWindow),
    searchWindow: result.searchWindow,
    fallbackApplied: result.searchWindow === "all-time",
    candidates: result.candidates,
  } satisfies ThesisKeyJournalSectionResult;
}

export async function findThesisKeyJournalCandidates(
  input: ThesisKeyJournalInput,
): Promise<ThesisKeyJournalSearchResult> {
  const domainTerms = inferDomainTerms(input);
  const requiredTerms = inferRequiredTerms(input);
  const targetJournals = inferTargetJournals(input);

  if (domainTerms.length === 0) {
    throw new Error("No searchable thesis terms were inferred from this project.");
  }

  const sections: ThesisKeyJournalSection[] = ["method", "results", "discussion"];
  const sectionResults = [];

  for (const section of sections) {
    sectionResults.push(await searchSection(section, input, domainTerms, requiredTerms, targetJournals));
  }

  return {
    searchedAt: new Date().toISOString(),
    domainTerms,
    requiredTerms,
    targetJournals,
    sections: sectionResults,
  };
}
