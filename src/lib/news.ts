import crypto from "crypto";
import Parser from "rss-parser";
import { stripTags } from "./format";
import type { BriefingItem, TopicProfile } from "./types";

type NewsRegion = "US" | "KR";

type GoogleNewsItem = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  source?: { title?: string; url?: string };
};

const parser = new Parser<object, GoogleNewsItem>({
  customFields: {
    item: [["source", "source"]],
  },
});

function sourceId(item: GoogleNewsItem) {
  const stable = item.guid ?? item.link ?? item.title ?? crypto.randomUUID();
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function buildGoogleNewsUrl(topic: TopicProfile, region: NewsRegion) {
  const terms = region === "US" ? topic.usNewsTerms : topic.krNewsTerms;
  const domainTerms =
    region === "US"
      ? ["medicine", "science", "engineering", "biotech"]
      : ["의학", "과학", "공학", "바이오", "의료"];
  const query = `(${terms.slice(0, 4).map((term) => `"${term}"`).join(" OR ")}) (${domainTerms
    .slice(0, 4)
    .join(" OR ")}) when:10d`;
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);

  if (region === "US") {
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");
  } else {
    url.searchParams.set("hl", "ko");
    url.searchParams.set("gl", "KR");
    url.searchParams.set("ceid", "KR:ko");
  }

  return url.toString();
}

function isInPeriod(item: GoogleNewsItem, startDate: Date, endDate: Date) {
  const date = new Date(item.isoDate ?? item.pubDate ?? "");
  if (Number.isNaN(date.getTime())) return true;
  return date >= startDate && date <= endDate;
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

export async function fetchNewsForTopic(
  topic: TopicProfile,
  region: NewsRegion,
  startDate: Date,
  endDate: Date,
) {
  const feed = await parser.parseURL(buildGoogleNewsUrl(topic, region));
  const seen = new Set<string>();
  const items: BriefingItem[] = [];

  for (const item of feed.items) {
    if (!item.title || !item.link || !isInPeriod(item, startDate, endDate)) continue;

    const normalized = normalizeTitle(item.title);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const snippet = stripTags(item.contentSnippet ?? item.content ?? "");
    items.push({
      topicSlug: topic.slug,
      kind: region === "US" ? "news_us" : "news_kr",
      sourceId: sourceId(item),
      title: stripTags(item.title),
      sourceName: item.source?.title ?? feed.title ?? "Google News",
      publishedAt: item.isoDate ?? item.pubDate ?? null,
      url: item.link,
      authors: [],
      snippet,
      tags: [topic.name, region === "US" ? "US News" : "Korea News"],
      importance: "medium",
      raw: item,
    });

    if (items.length >= 8) break;
  }

  return items;
}
