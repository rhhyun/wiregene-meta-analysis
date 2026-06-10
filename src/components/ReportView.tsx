import { CheckCircle2, Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildHyunlabJournalClubUrl } from "@/lib/journal-club";
import { getTopicName } from "@/lib/topics";
import type { BriefingItem, ReportWithItems } from "@/lib/types";
import { reportVersionLabel } from "@/lib/version";
import { ZoteroSyncButton } from "./ZoteroSyncButton";

type TopicGroup = {
  slug: string;
  name: string;
  summary: string;
  items: BriefingItem[];
};

function kindLabel(kind: BriefingItem["kind"]) {
  if (kind === "paper") return "논문";
  if (kind === "news_us") return "해외 기사";
  return "국내 기사";
}

function kindClass(kind: BriefingItem["kind"]) {
  if (kind === "paper") return "bg-sky-50 text-sky-800 ring-sky-200";
  if (kind === "news_us") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-rose-50 text-rose-900 ring-rose-200";
}

function importanceLabel(value: BriefingItem["importance"]) {
  if (value === "high") return "높음";
  if (value === "medium") return "중간";
  return "낮음";
}

function topicName(slug: string) {
  const knownName = getTopicName(slug);
  if (knownName !== slug) return knownName;
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function reportTopics(report: ReportWithItems) {
  const raw = report.raw;
  const rawTopics =
    typeof raw === "object" && raw !== null && Array.isArray((raw as { topics?: unknown }).topics)
      ? ((raw as { topics: unknown[] }).topics.filter(
          (topic): topic is string => typeof topic === "string" && topic.trim().length > 0,
        ))
      : [];
  return Array.from(new Set([...rawTopics, ...report.items.map((item) => item.topicSlug)]));
}

function reportTopicSummaries(report: ReportWithItems) {
  const raw = report.raw;
  if (typeof raw !== "object" || raw === null) return {};
  const topicSummaries = (raw as { topicSummaries?: unknown }).topicSummaries;
  if (!topicSummaries || typeof topicSummaries !== "object" || Array.isArray(topicSummaries)) {
    return {};
  }
  return topicSummaries as Record<string, string>;
}

function fallbackTopicSummary(slug: string, items: BriefingItem[]) {
  if (items.length === 0) {
    return `${topicName(slug)} 분야에서는 이번 검색 기간에 저장된 논문이나 기사가 없습니다.`;
  }

  const papers = items.filter((item) => item.kind === "paper").length;
  const usNews = items.filter((item) => item.kind === "news_us").length;
  const krNews = items.filter((item) => item.kind === "news_kr").length;
  return `${topicName(slug)} 분야에서는 논문 ${papers}건, 해외 기사 ${usNews}건, 국내 기사 ${krNews}건이 확인되었습니다. 아래 항목별 요약을 펼쳐 연구 근거와 현장 동향을 함께 검토할 수 있습니다.`;
}

function groupedByTopic(report: ReportWithItems): TopicGroup[] {
  const topicSummaries = reportTopicSummaries(report);
  return reportTopics(report).map((slug) => {
    const items = report.items.filter((item) => item.topicSlug === slug);
    return {
      slug,
      name: topicName(slug),
      summary: topicSummaries[slug] || fallbackTopicSummary(slug, items),
      items,
    };
  });
}

function itemSummaryText(item: BriefingItem) {
  return [item.summary, item.significance].filter(Boolean).join("\n\n");
}

function FoldoutText({ label, text }: { label: string; text: string }) {
  return (
    <details className="briefing-foldout rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <summary className="flex cursor-pointer flex-col gap-2 text-sm leading-6 text-zinc-700">
        <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">{label}</span>
        <span className="foldout-text whitespace-pre-line">{text || "요약이 없습니다."}</span>
        <span className="text-xs font-semibold text-emerald-700">
          <span className="foldout-closed">전체 보기</span>
          <span className="foldout-open">접기</span>
        </span>
      </summary>
    </details>
  );
}

function TopicCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
      {label} {value}
    </span>
  );
}

function BriefingItemCard({ item }: { item: BriefingItem }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${kindClass(
                item.kind,
              )}`}
            >
              {kindLabel(item.kind)}
            </span>
            <span className="text-sm text-zinc-500">{formatDate(item.publishedAt)}</span>
            <span className="text-sm text-zinc-500">중요도 {importanceLabel(item.importance)}</span>
            {item.zoteroKey ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Zotero 저장됨
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-7 text-zinc-950">{item.title}</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {item.sourceName}
            {item.doi ? ` · DOI ${item.doi}` : ""}
            {item.pmid ? ` · PMID ${item.pmid}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {item.kind === "paper" ? (
            <a
              href={buildHyunlabJournalClubUrl(item)}
              target="_blank"
              rel="noreferrer"
              title="HyunLab Journal Club"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-500"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Journal Club
            </a>
          ) : null}
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            title="원문 열기"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            원문
          </a>
        </div>
      </div>

      <div className="mt-4">
        <FoldoutText label="한글 요약" text={itemSummaryText(item)} />
      </div>

      {item.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ReportView({ report }: { report: ReportWithItems }) {
  const papers = report.items.filter((item) => item.kind === "paper");
  const topicGroups = groupedByTopic(report);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-zinc-500">
            {formatDate(report.periodStart)} - {formatDate(report.periodEnd)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950">
            {report.title}
          </h1>
          <div className="mt-3">
            <FoldoutText label="전체 브리핑 요약" text={report.summary} />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            생성: {formatDateTime(report.generatedAt)}
            {report.model ? ` · 요약 모델: ${report.model}` : " · OpenAI 없음: 기본 요약 사용"}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            {reportVersionLabel(report)}
          </p>
        </div>
        <div className="grid gap-3 sm:min-w-80">
          <a
            href={`/api/reports/${report.id}/ris`}
            title="논문 RIS 다운로드"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" aria-hidden />
            RIS 다운로드
          </a>
          {papers.length > 0 ? <ZoteroSyncButton reportId={report.id} paperCount={papers.length} /> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">PubMed 논문</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-950">{papers.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">해외 기사</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-950">
            {report.items.filter((item) => item.kind === "news_us").length}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">국내 기사</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-950">
            {report.items.filter((item) => item.kind === "news_kr").length}
          </p>
        </div>
      </div>

      {topicGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-600">
          이 기간에는 저장된 항목이 없습니다.
        </div>
      ) : (
        <div className="space-y-8">
          {topicGroups.map((group) => {
            const paperCount = group.items.filter((item) => item.kind === "paper").length;
            const usNewsCount = group.items.filter((item) => item.kind === "news_us").length;
            const krNewsCount = group.items.filter((item) => item.kind === "news_kr").length;

            return (
              <section key={group.slug} className="space-y-4 border-t border-zinc-200 pt-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <h2 className="text-2xl font-semibold tracking-normal text-zinc-950">
                      {group.name}
                    </h2>
                    <div className="mt-3">
                      <FoldoutText label="분야별 브리핑" text={group.summary} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <TopicCount label="논문" value={paperCount} />
                    <TopicCount label="해외 기사" value={usNewsCount} />
                    <TopicCount label="국내 기사" value={krNewsCount} />
                  </div>
                </div>

                {group.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-600">
                    이 분야에서는 이번 검색 기간에 저장된 항목이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <BriefingItemCard key={item.id ?? item.sourceId} item={item} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ReportLink({
  report,
}: {
  report: { id: string; title: string; generatedAt: string; raw?: unknown };
}) {
  return (
    <Link
      href={`/reports/${report.id}`}
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-zinc-400 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-center gap-3">
        <FileText className="h-4 w-4 text-zinc-500" aria-hidden />
        <span className="font-medium text-zinc-950">{report.title}</span>
      </span>
      <span className="text-sm text-zinc-500">
        {formatDateTime(report.generatedAt)} · {reportVersionLabel(report)}
      </span>
    </Link>
  );
}
