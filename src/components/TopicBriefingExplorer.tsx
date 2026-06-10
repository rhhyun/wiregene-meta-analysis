"use client";

import {
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Newspaper,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildHyunlabJournalClubUrl } from "@/lib/journal-club";
import type { BriefingItem, ReportWithItems, SourceKind, TopicProfile } from "@/lib/types";

type ItemFilter = SourceKind | "all";

type SourceOption = {
  kind: SourceKind;
  label: string;
  detail: string;
  icon: LucideIcon;
  iconClass: string;
  badgeClass: string;
  activeClass: string;
};

type TopicCard = {
  topic: TopicProfile;
  items: BriefingItem[];
  paperCount: number;
  usNewsCount: number;
  krNewsCount: number;
};

const sourceOptions: SourceOption[] = [
  {
    kind: "paper",
    label: "PubMed 논문",
    detail: "논문, 초록, PMID",
    icon: BookOpenText,
    iconClass: "bg-sky-50 text-sky-700 ring-sky-100",
    badgeClass: "bg-sky-50 text-sky-800 ring-sky-200",
    activeClass: "border-sky-400 bg-sky-50/60 ring-sky-100",
  },
  {
    kind: "news_us",
    label: "해외 기사",
    detail: "미국 중심 의학·과학 뉴스",
    icon: Globe2,
    iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
    badgeClass: "bg-amber-50 text-amber-900 ring-amber-200",
    activeClass: "border-amber-400 bg-amber-50/60 ring-amber-100",
  },
  {
    kind: "news_kr",
    label: "국내 기사",
    detail: "한국 의학·과학 뉴스",
    icon: Newspaper,
    iconClass: "bg-rose-50 text-rose-700 ring-rose-100",
    badgeClass: "bg-rose-50 text-rose-900 ring-rose-200",
    activeClass: "border-rose-400 bg-rose-50/60 ring-rose-100",
  },
];

const allFilter = {
  kind: "all" as const,
  label: "전체",
  detail: "논문과 기사 전체",
  icon: Search,
  iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  activeClass: "border-emerald-500 bg-emerald-50/70 ring-emerald-100",
};

function sourceOptionFor(kind: SourceKind) {
  return sourceOptions.find((option) => option.kind === kind) ?? sourceOptions[0];
}

function itemKey(item: BriefingItem) {
  return item.id ?? `${item.kind}:${item.sourceId}`;
}

function countItems(items: BriefingItem[], kind: SourceKind) {
  return items.filter((item) => item.kind === kind).length;
}

function importanceLabel(value: BriefingItem["importance"]) {
  if (value === "high") return "높음";
  if (value === "medium") return "중간";
  return "낮음";
}

function periodLabel(report: ReportWithItems) {
  return `${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`;
}

function itemText(item: BriefingItem) {
  return item.summary ?? item.snippet ?? item.abstract ?? "요약이 없습니다.";
}

function itemDetailText(item: BriefingItem) {
  return [item.summary ?? item.snippet ?? item.abstract, item.significance]
    .filter(Boolean)
    .join("\n\n");
}

function topicCardsFor(topics: TopicProfile[], items: BriefingItem[]): TopicCard[] {
  return topics.map((topic) => {
    const topicItems = items.filter((item) => item.topicSlug === topic.slug);
    return {
      topic,
      items: topicItems,
      paperCount: countItems(topicItems, "paper"),
      usNewsCount: countItems(topicItems, "news_us"),
      krNewsCount: countItems(topicItems, "news_kr"),
    };
  });
}

export function TopicBriefingExplorer({
  topics,
  reports,
}: {
  topics: TopicProfile[];
  reports: ReportWithItems[];
}) {
  const [selectedReportId, setSelectedReportId] = useState(reports[0]?.id ?? "");
  const [selectedTopicSlug, setSelectedTopicSlug] = useState(topics[0]?.slug ?? "");
  const [selectedKind, setSelectedKind] = useState<ItemFilter>("all");
  const [selectedItemKey, setSelectedItemKey] = useState("");

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null,
    [reports, selectedReportId],
  );
  const selectedReportItems = useMemo(() => selectedReport?.items ?? [], [selectedReport]);
  const topicCards = useMemo(
    () => topicCardsFor(topics, selectedReportItems),
    [topics, selectedReportItems],
  );
  const selectedTopicCard =
    topicCards.find((card) => card.topic.slug === selectedTopicSlug) ?? topicCards[0] ?? null;
  const selectedTopicItems = useMemo(
    () => selectedTopicCard?.items ?? [],
    [selectedTopicCard],
  );
  const filteredItems = useMemo(
    () =>
      selectedKind === "all"
        ? selectedTopicItems
        : selectedTopicItems.filter((item) => item.kind === selectedKind),
    [selectedKind, selectedTopicItems],
  );
  const selectedItem =
    filteredItems.find((item) => itemKey(item) === selectedItemKey) ?? filteredItems[0] ?? null;

  function selectReport(reportId: string) {
    setSelectedReportId(reportId);
    setSelectedKind("all");
    setSelectedItemKey("");
  }

  function selectTopic(slug: string) {
    setSelectedTopicSlug(slug);
    setSelectedKind("all");
    setSelectedItemKey("");
  }

  function selectFilter(kind: ItemFilter) {
    setSelectedKind(kind);
    setSelectedItemKey("");
  }

  return (
    <section className="space-y-6" aria-label="분야별 브리핑 탐색">
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CalendarDays className="h-4 w-4" aria-hidden />
              검색 기간
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-normal text-zinc-950">
              {selectedReport ? periodLabel(selectedReport) : "저장된 검색 기간 없음"}
            </h2>
            {selectedReport ? (
              <p className="mt-1 text-sm text-zinc-500">
                생성:{" "}
                <span suppressHydrationWarning>
                  {formatDateTime(selectedReport.generatedAt)}
                </span>{" "}
                · 전체 {selectedReport.items.length}개 항목
              </p>
            ) : null}
          </div>
        </div>

        {reports.length > 0 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="저장된 검색 기간">
            {reports.map((report) => {
              const isSelected = selectedReport?.id === report.id;
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => selectReport(report.id)}
                  aria-pressed={isSelected}
                  title={`${periodLabel(report)} 리포트`}
                  className={`shrink-0 rounded-md border px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  <span className="block font-semibold">{periodLabel(report)}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {report.items.length}개 항목
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            저장된 리포트가 없습니다.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden />
          <h2 className="text-lg font-semibold text-zinc-950">추적 분야</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {topicCards.map((card) => {
            const isSelected = selectedTopicCard?.topic.slug === card.topic.slug;
            return (
              <button
                key={card.topic.slug}
                type="button"
                onClick={() => selectTopic(card.topic.slug)}
                aria-pressed={isSelected}
                className={`rounded-lg border bg-white p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  isSelected
                    ? "border-emerald-500 ring-1 ring-emerald-100"
                    : "border-zinc-200 hover:border-emerald-400 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950">{card.topic.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {card.topic.description}
                    </p>
                  </div>
                  <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-sm font-semibold text-zinc-700">
                    {card.items.length}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <TopicCount label="논문" value={card.paperCount} />
                  <TopicCount label="해외" value={card.usNewsCount} />
                  <TopicCount label="국내" value={card.krNewsCount} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedTopicCard ? (
        <div className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm font-semibold text-emerald-700">선택 분야</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              {selectedTopicCard.topic.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {selectedTopicCard.topic.description}
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-4" aria-label="자료 유형">
            <FilterButton
              label={allFilter.label}
              detail={allFilter.detail}
              count={selectedTopicItems.length}
              icon={allFilter.icon}
              iconClass={allFilter.iconClass}
              activeClass={allFilter.activeClass}
              isSelected={selectedKind === "all"}
              onClick={() => selectFilter("all")}
            />
            {sourceOptions.map((option) => (
              <FilterButton
                key={option.kind}
                label={option.label}
                detail={option.detail}
                count={countItems(selectedTopicItems, option.kind)}
                icon={option.icon}
                iconClass={option.iconClass}
                activeClass={option.activeClass}
                isSelected={selectedKind === option.kind}
                onClick={() => selectFilter(option.kind)}
              />
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  {selectedReport ? periodLabel(selectedReport) : "검색 기간 없음"}
                </p>
                <h2 className="text-lg font-semibold text-zinc-950">
                  {selectedTopicCard.topic.name} ·{" "}
                  {selectedKind === "all" ? allFilter.label : sourceOptionFor(selectedKind).label}
                </h2>
              </div>
              <p className="text-sm font-medium text-zinc-500">{filteredItems.length}개 결과</p>
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
                선택한 조건에 맞는 항목이 없습니다.
              </div>
            ) : (
              <>
                <div className="grid gap-2 lg:grid-cols-2">
                  {filteredItems.map((item) => (
                    <BriefingItemButton
                      key={itemKey(item)}
                      item={item}
                      isSelected={itemKey(item) === itemKey(selectedItem ?? item)}
                      onClick={() => setSelectedItemKey(itemKey(item))}
                    />
                  ))}
                </div>

                <div className="pt-2">
                  {selectedItem ? <BriefingResultItem item={selectedItem} /> : null}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function TopicCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
      {label} {value}
    </span>
  );
}

function FilterButton({
  label,
  detail,
  count,
  icon: Icon,
  iconClass,
  activeClass,
  isSelected,
  onClick,
}: {
  label: string;
  detail: string;
  count: number;
  icon: LucideIcon;
  iconClass: string;
  activeClass: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`rounded-lg border bg-white p-4 text-left transition hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
        isSelected ? `${activeClass} ring-1` : "border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-md ring-1 ${iconClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-3xl font-semibold text-zinc-950">{count}</span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-950">{label}</h3>
      <p className="mt-1 text-sm text-zinc-500">{detail}</p>
    </button>
  );
}

function BriefingItemButton({
  item,
  isSelected,
  onClick,
}: {
  item: BriefingItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const option = sourceOptionFor(item.kind);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`rounded-lg border bg-white p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
        isSelected ? "border-emerald-500 ring-1 ring-emerald-100" : "border-zinc-200 hover:border-zinc-400"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${option.badgeClass}`}
        >
          {option.label}
        </span>
        <span className="text-xs text-zinc-500">{formatDate(item.publishedAt)}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-zinc-950">
        {item.title}
      </h3>
      <p className="mt-1 truncate text-xs text-zinc-500">{item.sourceName}</p>
    </button>
  );
}

function BriefingResultItem({ item }: { item: BriefingItem }) {
  const option = sourceOptionFor(item.kind);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${option.badgeClass}`}
            >
              {option.label}
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
              <BookOpenText className="h-4 w-4" aria-hidden />
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
      <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-700">
        {itemDetailText(item) || itemText(item)}
      </p>
      {(item.tags ?? []).length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(item.tags ?? []).map((tag) => (
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
