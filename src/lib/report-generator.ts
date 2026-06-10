import crypto from "crypto";
import { getEnabledTopics, saveReport } from "./db";
import { subtractDays, toInputDate } from "./format";
import { fetchNewsForTopic } from "./news";
import { fetchPubMedForTopic } from "./pubmed";
import { summarizeItems } from "./summarizer";
import { BRIEFING_VERSION } from "./version";
import type { BriefingItem, ReportWithItems, TopicProfile } from "./types";

type TopicLoader = () => Promise<TopicProfile[]>;

function dedupeItems(items: BriefingItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderItems(items: BriefingItem[]) {
  const weight = { high: 0, medium: 1, low: 2 };
  const kindWeight = { paper: 0, news_us: 1, news_kr: 2 };

  return [...items].sort((a, b) => {
    const important = weight[a.importance] - weight[b.importance];
    if (important !== 0) return important;

    const kind = kindWeight[a.kind] - kindWeight[b.kind];
    if (kind !== 0) return kind;

    return String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""));
  });
}

export async function buildResearchReportPayload(
  daysBack = 7,
  loadTopics: TopicLoader = getEnabledTopics,
) {
  const endDate = new Date();
  const startDate = subtractDays(endDate, daysBack);
  const topics = await loadTopics();
  const gathered: BriefingItem[] = [];
  const errors: string[] = [];

  for (const topic of topics) {
    try {
      gathered.push(...(await fetchPubMedForTopic(topic, startDate, endDate)));
    } catch (error) {
      errors.push(`${topic.name} PubMed: ${(error as Error).message}`);
    }

    try {
      gathered.push(...(await fetchNewsForTopic(topic, "US", startDate, endDate)));
    } catch (error) {
      errors.push(`${topic.name} US news: ${(error as Error).message}`);
    }

    try {
      gathered.push(...(await fetchNewsForTopic(topic, "KR", startDate, endDate)));
    } catch (error) {
      errors.push(`${topic.name} KR news: ${(error as Error).message}`);
    }
  }

  const ordered = orderItems(dedupeItems(gathered));
  const summarized = await summarizeItems(ordered);
  const periodStart = toInputDate(startDate);
  const periodEnd = toInputDate(endDate);
  const title = `연구 브리핑 ${periodStart} - ${periodEnd}`;

  return {
    report: {
      id: crypto.randomUUID(),
      title,
      periodStart,
      periodEnd,
      generatedAt: new Date().toISOString(),
      summary:
        errors.length > 0
          ? `${summarized.reportSummary}\n\n일부 검색 오류: ${errors.join("; ")}`
          : summarized.reportSummary,
      status: "completed" as const,
      model: summarized.model,
      raw: {
        briefingVersion: BRIEFING_VERSION,
        topics: topics.map((topic) => topic.slug),
        topicSummaries: summarized.topicSummaries,
        errors,
      },
    },
    items: summarized.items,
  };
}

export async function generateResearchReport(daysBack = 7) {
  const payload = await buildResearchReportPayload(daysBack);
  return saveReport(payload.report, payload.items);
}

export async function generateResearchReportWithStorage(
  save: (report: ReportWithItems) => Promise<ReportWithItems>,
  daysBack = 7,
  loadTopics?: TopicLoader,
) {
  const payload = await buildResearchReportPayload(daysBack, loadTopics);
  return save({
    ...payload.report,
    items: payload.items,
  });
}
