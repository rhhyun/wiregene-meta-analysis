import OpenAI from "openai";
import { config } from "./config";
import { getTopicName } from "./topics";
import type { BriefingItem } from "./types";

type AiSummary = {
  sourceId: string;
  summary: string;
  significance: string;
  tags: string[];
  importance: "high" | "medium" | "low";
};

type AiTopicSummary = {
  topicSlug: string;
  summary: string;
};

function sourceKindLabel(item: BriefingItem) {
  if (item.kind === "paper") return "논문";
  if (item.kind === "news_us") return "해외 기사";
  return "국내 기사";
}

function fallbackItemSummary(item: BriefingItem): BriefingItem {
  const topicName = getTopicName(item.topicSlug);
  const sourceKind = sourceKindLabel(item);
  const base = item.abstract || item.snippet || "원문 링크에서 세부 내용을 확인해야 합니다.";
  return {
    ...item,
    summary:
      item.summary ??
      `${topicName} 분야와 관련된 최신 ${sourceKind}입니다. 핵심 내용은 원문 또는 초록을 기준으로 추가 확인이 필요합니다. 참고 내용: ${base.slice(
        0,
        260,
      )}`,
    significance:
      item.significance ??
      `${topicName} 분야의 연구계획, 임상 적용 가능성, 기술 동향을 점검할 때 참고할 수 있는 자료입니다.`,
  };
}

function groupItemsByTopic(items: BriefingItem[]) {
  const grouped = new Map<string, BriefingItem[]>();
  for (const item of items) {
    const current = grouped.get(item.topicSlug) ?? [];
    current.push(item);
    grouped.set(item.topicSlug, current);
  }
  return grouped;
}

function fallbackTopicSummaries(items: BriefingItem[]) {
  const summaries: Record<string, string> = {};
  for (const [topicSlug, topicItems] of groupItemsByTopic(items)) {
    const papers = topicItems.filter((item) => item.kind === "paper").length;
    const usNews = topicItems.filter((item) => item.kind === "news_us").length;
    const krNews = topicItems.filter((item) => item.kind === "news_kr").length;
    summaries[topicSlug] = `${getTopicName(topicSlug)} 분야에서는 논문 ${papers}건, 해외 기사 ${usNews}건, 국내 기사 ${krNews}건이 확인되었습니다. 아래 항목을 중심으로 연구 동향과 적용 가능성을 검토하세요.`;
  }
  return summaries;
}

function fallbackReportSummary(items: BriefingItem[]) {
  if (items.length === 0) {
    return "설정된 기간에 저장할 신규 논문 또는 기사가 발견되지 않았습니다.";
  }

  const papers = items.filter((item) => item.kind === "paper").length;
  const usNews = items.filter((item) => item.kind === "news_us").length;
  const krNews = items.filter((item) => item.kind === "news_kr").length;
  const topics = new Set(items.map((item) => item.topicSlug)).size;
  return `이번 브리핑은 ${topics}개 분야에서 PubMed 논문 ${papers}건, 해외 기사 ${usNews}건, 국내 기사 ${krNews}건을 정리했습니다. 각 분야별 섹션에서 논문과 기사를 함께 검토할 수 있습니다.`;
}

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "";
}

export async function summarizeItems(items: BriefingItem[]) {
  if (!config.openaiApiKey || items.length === 0) {
    return {
      items: items.map(fallbackItemSummary),
      reportSummary: fallbackReportSummary(items),
      topicSummaries: fallbackTopicSummaries(items),
      model: config.openaiApiKey ? config.openaiModel : null,
    };
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const compactItems = items.map((item) => ({
    sourceId: item.sourceId,
    topicSlug: item.topicSlug,
    topic: getTopicName(item.topicSlug),
    kind: item.kind,
    title: item.title,
    source: item.sourceName,
    date: item.publishedAt,
    abstractOrSnippet: item.abstract || item.snippet,
  }));

  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      input: `You are a Korean research briefing editor for biomedical, clinical, and engineering researchers.

Summarize the supplied PubMed papers and news articles.

Requirements:
- Write reportSummary, topicSummaries, item summary, and significance entirely in Korean.
- Divide the briefing by research topic/field using topicSlug.
- Cover both papers and news articles. Do not omit news just because it is not a paper.
- For papers, summarize the research question, method/design, key finding, and limitation when available.
- For news articles, summarize the event, institution/company/regulatory context, and research implication when available.
- Do not invent findings that are not supported by the supplied title, abstract, or snippet.
- Keep each item summary to 2-3 Korean sentences.
- Keep each item significance to 1-2 Korean sentences.
- Keep each topic summary to 3-5 Korean sentences.

Return only one JSON object with this schema:
{
  "reportSummary": "Korean overall briefing summary in 3-5 sentences",
  "topicSummaries": [
    {
      "topicSlug": "input topicSlug",
      "summary": "Korean topic-level briefing in 3-5 sentences"
    }
  ],
  "items": [
    {
      "sourceId": "input sourceId",
      "summary": "Korean 2-3 sentence summary",
      "significance": "Korean 1-2 sentence explanation of why this matters",
      "tags": ["Korean or English short tags"],
      "importance": "high | medium | low"
    }
  ]
}

Input:
${JSON.stringify(compactItems, null, 2)}`,
    });

    const parsed = JSON.parse(extractJson(response.output_text)) as {
      reportSummary?: string;
      topicSummaries?: AiTopicSummary[];
      items?: AiSummary[];
    };
    const summaryMap = new Map(parsed.items?.map((item) => [item.sourceId, item]) ?? []);
    const topicSummaries = {
      ...fallbackTopicSummaries(items),
      ...Object.fromEntries(
        (parsed.topicSummaries ?? [])
          .filter((item) => item.topicSlug && item.summary)
          .map((item) => [item.topicSlug, item.summary]),
      ),
    };

    return {
      items: items.map((item) => {
        const summary = summaryMap.get(item.sourceId);
        if (!summary) return fallbackItemSummary(item);
        return {
          ...item,
          summary: summary.summary,
          significance: summary.significance,
          tags: Array.from(new Set([...item.tags, ...(summary.tags ?? [])])),
          importance: summary.importance ?? item.importance,
        };
      }),
      reportSummary: parsed.reportSummary ?? fallbackReportSummary(items),
      topicSummaries,
      model: config.openaiModel,
    };
  } catch (error) {
    console.error("OpenAI summarization failed; using fallback summaries.", error);
    return {
      items: items.map(fallbackItemSummary),
      reportSummary: fallbackReportSummary(items),
      topicSummaries: fallbackTopicSummaries(items),
      model: config.openaiModel,
    };
  }
}
