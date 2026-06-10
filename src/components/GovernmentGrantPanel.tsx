"use client";

import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Hospital,
  Loader2,
  Save,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";
import type {
  GrantCandidateProject,
  GrantEntityType,
  GrantKeywordPreset,
  GrantOpportunity,
  GrantOpportunityRfpPreview,
  GrantSearchResponse,
  GrantSourceGroup,
  TopicProfile,
} from "@/lib/types";

type MetricFilter =
  | "all"
  | "open"
  | "candidate"
  | "school"
  | "hospital"
  | "company"
  | "graduate"
  | "postdoc";

const panelConfig: Record<
  GrantSourceGroup,
  {
    eyebrow: string;
    title: string;
    description: string;
    button: string;
    keywords: string[];
    includeExternalDefault: boolean;
    sourceHint: string;
  }
> = {
  central: {
    eyebrow: "Government & Regional Grant Finder",
    title: "정부·지자체 과제 공고 검색 및 지원 준비",
    description:
      "IRIS, NRF, 범부처 의료기기, 보건복지부, 산업부, 중기부, 과기정통부, 국방부와 식약처·질병관리청·서울시·경기도·충북 등 지자체/규제기관 과제를 한 번에 검색합니다.",
    button: "현재 접수 과제 검색",
    keywords: ["척수손상", "신경재활", "의료기기", "의료 AI", "임상시험"],
    includeExternalDefault: true,
    sourceHint: "IRIS와 부처·전문기관·지자체 공식 사이트 포함",
  },
  "regional-regulatory": {
    eyebrow: "Regional & Regulatory Grant Finder",
    title: "지자체·규제기관 과제 검색",
    description:
      "식약처, 질병관리청, 서울시, 경기도, 충북 등 지역/규제기관 과제를 별도로 확인합니다.",
    button: "지자체·규제 과제 검색",
    keywords: ["식약처", "질병관리청", "서울 R&D", "경기도", "충북"],
    includeExternalDefault: true,
    sourceHint: "식약처·질병관리청·서울·경기·충북 공식 사이트 포함",
  },
  investment: {
    eyebrow: "Investment Program Finder",
    title: "투자 관련 과제 및 글로벌 프로그램 검색",
    description:
      "TIPS, K-Startup, 민간투자연계 R&D, 기업 투자·액셀러레이션, Google/AWS/Amazon 글로벌 스타트업 프로그램을 별도로 추적합니다.",
    button: "투자 프로그램 검색",
    keywords: ["TIPS", "민간투자연계", "스타트업", "의료 AI", "AWS Activate"],
    includeExternalDefault: true,
    sourceHint: "TIPS·K-Startup·Bizinfo·Google·Amazon/AWS 정보 포함",
  },
  "global-research": {
    eyebrow: "Global Research Grant Finder",
    title: "글로벌 연구과제 및 SCI 특화 과제 검색",
    description:
      "Wings for Life, Spinal Research, Neilsen Foundation, Reeve Foundation, PVA, NIH, CDMRP, NIDILRR, Horizon Europe 등 SCI/신경재활 글로벌 연구비를 추적합니다.",
    button: "글로벌 연구과제 검색",
    keywords: ["spinal cord injury", "SCI", "neurorehabilitation", "neuromodulation", "clinical translation"],
    includeExternalDefault: true,
    sourceHint: "Wings for Life·SCI 재단·NIH/CDMRP/NIDILRR·Horizon Europe 포함",
  },
  "trainee-fellowship": {
    eyebrow: "Graduate & Postdoc Fellowship Finder",
    title: "대학원생·포닥 지원 가능 과제 검색",
    description:
      "석사·박사·석박통합 과정생과 포닥이 개인 또는 host institution을 통해 지원할 수 있는 국내외 연구비를 추적합니다.",
    button: "학생·포닥 과제 검색",
    keywords: ["석박통합", "대학원생", "박사과정", "포닥", "postdoctoral fellowship"],
    includeExternalDefault: true,
    sourceHint: "NRF·IRIS·BK21·학자금재단·HFSP·EMBO·MSCA·NIH 포함",
  },
};

const entityOptions: Array<{
  value: GrantEntityType;
  label: string;
  icon: typeof GraduationCap;
}> = [
  { value: "school", label: "학교", icon: GraduationCap },
  { value: "hospital", label: "병원", icon: Hospital },
  { value: "company", label: "회사", icon: Building2 },
  { value: "graduate", label: "대학원생", icon: GraduationCap },
  { value: "postdoc", label: "포닥", icon: UserRound },
];

function listToText(values: string[]) {
  return values.join("\n");
}

function textToList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function seedGrantKeywords(topics: TopicProfile[], sourceGroup: GrantSourceGroup) {
  if (sourceGroup !== "central") return panelConfig[sourceGroup].keywords.slice(0, 5);
  const fromProfiles = topics
    .slice(0, 5)
    .map((topic) => topic.name || topic.terms[0] || topic.koreanTerms[0])
    .filter(Boolean);
  return [...fromProfiles, ...panelConfig.central.keywords].slice(0, 5);
}

function entityLabel(entity: GrantEntityType) {
  if (entity === "school") return "학교";
  if (entity === "hospital") return "병원";
  if (entity === "graduate") return "대학원생";
  if (entity === "postdoc") return "포닥";
  return "회사";
}

function statusTone(status: GrantOpportunity["status"]) {
  if (status === "open") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "candidate") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function formatDate(value: string | null) {
  return value || "확인 필요";
}

async function readGrantPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, `요청 실패(HTTP ${response.status})`));
  }
  return payload as GrantSearchResponse;
}

function matchesFilter(item: GrantOpportunity, filter: MetricFilter) {
  if (filter === "all") return true;
  if (filter === "open") return item.status === "open";
  if (filter === "candidate") return item.status !== "open";
  return item.eligibleEntities.includes(filter);
}

function filterLabel(filter: MetricFilter) {
  if (filter === "all") return "전체";
  if (filter === "open") return "접수중";
  if (filter === "candidate") return "확인 후보";
  return `${entityLabel(filter)} 가능`;
}

export function GovernmentGrantPanel({
  topics,
  sourceGroup = "central",
}: {
  topics: TopicProfile[];
  sourceGroup?: GrantSourceGroup;
}) {
  const config = panelConfig[sourceGroup];
  const resultsRef = useRef<HTMLElement | null>(null);
  const savingPresetRef = useRef(false);
  const registeringIdsRef = useRef(new Set<string>());
  const excludingIdsRef = useRef(new Set<string>());
  const [baseKeywords, setBaseKeywords] = useState(() => seedGrantKeywords(topics, sourceGroup));
  const [keywordText, setKeywordText] = useState(() => listToText(config.keywords));
  const [entities, setEntities] = useState<GrantEntityType[]>(["school", "hospital", "company", "graduate", "postdoc"]);
  const [includeExternalSources, setIncludeExternalSources] = useState(config.includeExternalDefault);
  const [limit, setLimit] = useState(30);
  const [result, setResult] = useState<GrantSearchResponse | null>(null);
  const [activeFilter, setActiveFilter] = useState<MetricFilter>("all");
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(() => new Set());
  const [registeringId, setRegisteringId] = useState("");
  const [excludingId, setExcludingId] = useState("");
  const [registerMessage, setRegisterMessage] = useState("");
  const [presetMessage, setPresetMessage] = useState("");

  const activeBaseKeywords = useMemo(() => baseKeywords.map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5), [baseKeywords]);
  const expandedKeywordList = useMemo(() => textToList(keywordText), [keywordText]);

  const metrics = useMemo(() => {
    const opportunities = result?.opportunities ?? [];
    return {
      all: opportunities.length,
      open: opportunities.filter((item) => item.status === "open").length,
      candidate: opportunities.filter((item) => item.status !== "open").length,
      school: result?.entitySummary.school ?? 0,
      hospital: result?.entitySummary.hospital ?? 0,
      company: result?.entitySummary.company ?? 0,
      graduate: result?.entitySummary.graduate ?? 0,
      postdoc: result?.entitySummary.postdoc ?? 0,
    };
  }, [result]);

  const visibleOpportunities = useMemo(
    () => (result?.opportunities ?? []).filter((item) => matchesFilter(item, activeFilter)),
    [activeFilter, result],
  );

  async function requestExpandedKeywords(keywords: string[], extraKeywords: string[]) {
    const response = await fetch("/api/grants/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: keywords.slice(0, 5),
        extraKeywords,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      expandedKeywords?: string[];
      error?: string;
      details?: unknown;
    };
    if (!response.ok) throw new Error(apiErrorMessage(payload, "확장 키워드 생성에 실패했습니다."));
    return payload.expandedKeywords ?? extraKeywords;
  }

  function updateBaseKeyword(index: number, value: string) {
    setBaseKeywords((current) => {
      const next = [...current];
      next[index] = value;
      return Array.from({ length: 5 }, (_, keywordIndex) => next[keywordIndex] ?? "");
    });
    setPresetMessage("변경한 기본 키워드는 저장해야 다음에도 유지됩니다.");
  }

  function scrollToResults() {
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function applyFilter(filter: MetricFilter) {
    setActiveFilter(filter);
    scrollToResults();
  }

  async function expandKeywords(keywordSeed?: string[], extraKeywordSeed?: string[]) {
    setIsExpanding(true);
    setError("");
    try {
      const expandedKeywords = await requestExpandedKeywords(
        keywordSeed ?? activeBaseKeywords,
        extraKeywordSeed ?? expandedKeywordList,
      );
      setKeywordText(listToText(expandedKeywords));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "확장 키워드 생성에 실패했습니다.");
    } finally {
      setIsExpanding(false);
    }
  }

  async function saveBaseKeywordPreset() {
    if (savingPresetRef.current) return;
    savingPresetRef.current = true;
    setIsSavingPreset(true);
    setError("");
    try {
      const response = await fetch("/api/grants/keyword-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceGroup, baseKeywords: activeBaseKeywords }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        preset?: GrantKeywordPreset;
        error?: string;
        details?: unknown;
      };
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "기본 키워드 저장에 실패했습니다."));
      }
      if (payload.preset?.baseKeywords.length) setBaseKeywords(payload.preset.baseKeywords);
      setPresetMessage("기본 키워드를 저장했습니다. 다음 접속부터 이 값이 먼저 적용됩니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "기본 키워드 저장에 실패했습니다.");
    } finally {
      savingPresetRef.current = false;
      setIsSavingPreset(false);
    }
  }

  async function searchGrants() {
    setIsSearching(true);
    setError("");
    setRegisterMessage("");
    setActiveFilter("all");
    try {
      const payload = await readGrantPayload(
        await fetch("/api/grants/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceGroup,
            topics: activeBaseKeywords,
            extraKeywords: expandedKeywordList,
            institutionTypes: entities,
            includeExternalSources,
            limit,
          }),
        }),
      );
      setResult(payload);
      scrollToResults();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "검색에 실패했습니다.");
    } finally {
      setIsSearching(false);
    }
  }

  function toggleEntity(entity: GrantEntityType) {
    setEntities((current) =>
      current.includes(entity) ? current.filter((item) => item !== entity) : [...current, entity],
    );
  }

  async function registerCandidate(item: GrantOpportunity) {
    if (registeredIds.has(item.id) || registeringIdsRef.current.size > 0 || excludingIdsRef.current.size > 0) return;
    registeringIdsRef.current.add(item.id);
    setRegisteringId(item.id);
    setRegisterMessage("");
    setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/grants/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceGroup, opportunity: item }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "지원후보 등록에 실패했습니다."));
      }
      const candidateId = payload.candidate?.id;
      setRegisteredIds((current) => new Set([...current, item.id]));
      setRegisterMessage(
        candidateId
          ? "지원후보과제에 등록했습니다. 지원후보과제 메뉴에서 준비 현황을 확인하세요."
          : "지원후보과제에 등록했습니다.",
      );
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "지원후보 등록 요청이 20초 안에 끝나지 않았습니다. 다시 시도하거나 지원후보과제 메뉴에서 등록 여부를 확인하세요."
          : caught instanceof Error
            ? caught.message
            : "지원후보 등록에 실패했습니다.",
      );
    } finally {
      window.clearTimeout(timeoutId);
      registeringIdsRef.current.delete(item.id);
      setRegisteringId("");
    }
  }

  async function excludeOpportunity(item: GrantOpportunity) {
    if (excludingIdsRef.current.size > 0 || registeringIdsRef.current.size > 0) return;
    excludingIdsRef.current.add(item.id);
    const previousResult = result;
    setExcludingId(item.id);
    setRegisterMessage("");
    setError("");
    setResult((current) => removeOpportunityFromResult(current, item.id));
    try {
      const response = await fetch("/api/grants/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceGroup, opportunity: item, reason: "not-relevant" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "과제 배제에 실패했습니다."));
      }
      setRegisterMessage("해당 과제를 목록에서 제거했습니다. 다음 검색부터 같은 과제는 표시하지 않습니다.");
    } catch (caught) {
      setResult(previousResult);
      setError(caught instanceof Error ? caught.message : "과제 배제에 실패했습니다.");
    } finally {
      excludingIdsRef.current.delete(item.id);
      setExcludingId("");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const fallbackKeywords = seedGrantKeywords(topics, sourceGroup);

    async function loadKeywordPreset() {
      setIsLoadingPreset(true);
      setPresetMessage("");
      try {
        const response = await fetch(`/api/grants/keyword-presets?sourceGroup=${encodeURIComponent(sourceGroup)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          preset?: GrantKeywordPreset | null;
          error?: string;
          details?: unknown;
        };
        if (!response.ok) throw new Error(apiErrorMessage(payload, "기본 키워드를 불러오지 못했습니다."));

        const savedKeywords = payload.preset?.baseKeywords.filter(Boolean).slice(0, 5) ?? [];
        const nextKeywords = savedKeywords.length > 0 ? savedKeywords : fallbackKeywords;
        let expandedKeywords = nextKeywords;

        try {
          expandedKeywords = await requestExpandedKeywords(nextKeywords, []);
        } catch {
          expandedKeywords = nextKeywords;
        }

        if (cancelled) return;
        setBaseKeywords(nextKeywords);
        setKeywordText(listToText(expandedKeywords));
        setPresetMessage(savedKeywords.length > 0 ? "저장된 기본 키워드를 불러왔습니다." : "");
      } catch {
        if (cancelled) return;
        setBaseKeywords(fallbackKeywords);
        setKeywordText(listToText(fallbackKeywords));
        setPresetMessage("저장된 기본 키워드를 불러오지 못해 기본값을 사용합니다.");
      } finally {
        if (!cancelled) setIsLoadingPreset(false);
      }
    }

    void loadKeywordPreset();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceGroup]);

  useEffect(() => {
    let cancelled = false;
    async function loadRegisteredCandidates() {
      const response = await fetch("/api/grants/candidates", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as { candidates?: GrantCandidateProject[] };
      if (cancelled) return;
      setRegisteredIds(
        new Set(
          (payload.candidates ?? [])
            .filter((candidate) => candidate.sourceGroup === sourceGroup)
            .map((candidate) => candidate.opportunity.id),
        ),
      );
    }
    void loadRegisteredCandidates();
    return () => {
      cancelled = true;
    };
  }, [sourceGroup]);

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-700">{config.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">{config.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{config.description}</p>
          </div>
          <button
            type="button"
            onClick={searchGrants}
            disabled={isSearching || entities.length === 0 || activeBaseKeywords.length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            {isSearching ? "검색 중" : config.button}
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-zinc-800">기본 키워드</p>
              <p className="text-xs leading-5 text-zinc-500">
                최대 5개까지 저장할 수 있고, 저장된 값은 다음 접속부터 이 메뉴의 기본값으로 적용됩니다.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <input
                  key={index}
                  value={baseKeywords[index] ?? ""}
                  onChange={(event) => updateBaseKeyword(index, event.target.value)}
                  placeholder={`키워드 ${index + 1}`}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-sky-500"
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveBaseKeywordPreset()}
                disabled={isLoadingPreset || isSavingPreset || activeBaseKeywords.length === 0}
                className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                {isSavingPreset ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                기본 키워드 저장
              </button>
              <button
                type="button"
                onClick={() => void expandKeywords()}
                disabled={isExpanding || activeBaseKeywords.length === 0}
                className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                {isExpanding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                확장 키워드 생성
              </button>
            </div>
            {isLoadingPreset || presetMessage ? (
              <p className="text-xs leading-5 text-zinc-500">
                {isLoadingPreset ? "저장된 기본 키워드를 불러오는 중입니다." : presetMessage}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              확장 키워드
              <textarea
                value={keywordText}
                onChange={(event) => setKeywordText(event.target.value)}
                rows={7}
                className="min-h-44 rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal leading-6 outline-sky-500"
              />
            </label>
            <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {entityOptions.map((option) => {
                  const Icon = option.icon;
                  const active = entities.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleEntity(option.value)}
                      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                        active ? "border-sky-200 bg-sky-50 text-sky-800" : "border-zinc-200 bg-white text-zinc-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={includeExternalSources}
                    onChange={(event) => setIncludeExternalSources(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {config.sourceHint}
                </label>
                <label className="grid gap-1 text-xs font-semibold text-zinc-600">
                  표시 건수
                  <select
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-sky-500"
                  >
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={80}>80</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-950" role="alert">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        </section>
      ) : null}

      {result ? (
        <>
          <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
            <GrantMetric title="접수중" value={metrics.open} icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50 ring-emerald-100" active={activeFilter === "open"} onClick={() => applyFilter("open")} />
            <GrantMetric title="확인 후보" value={metrics.candidate} icon={Search} tone="text-amber-700 bg-amber-50 ring-amber-100" active={activeFilter === "candidate"} onClick={() => applyFilter("candidate")} />
            <GrantMetric title="학교 가능" value={metrics.school} icon={GraduationCap} tone="text-sky-700 bg-sky-50 ring-sky-100" active={activeFilter === "school"} onClick={() => applyFilter("school")} />
            <GrantMetric title="병원 가능" value={metrics.hospital} icon={Hospital} tone="text-rose-700 bg-rose-50 ring-rose-100" active={activeFilter === "hospital"} onClick={() => applyFilter("hospital")} />
            <GrantMetric title="회사 가능" value={metrics.company} icon={Building2} tone="text-violet-700 bg-violet-50 ring-violet-100" active={activeFilter === "company"} onClick={() => applyFilter("company")} />
            <GrantMetric title="학생 가능" value={metrics.graduate} icon={GraduationCap} tone="text-teal-700 bg-teal-50 ring-teal-100" active={activeFilter === "graduate"} onClick={() => applyFilter("graduate")} />
            <GrantMetric title="포닥 가능" value={metrics.postdoc} icon={UserRound} tone="text-indigo-700 bg-indigo-50 ring-indigo-100" active={activeFilter === "postdoc"} onClick={() => applyFilter("postdoc")} />
          </section>

          <section ref={resultsRef} id="grant-results" className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950">검색 결과</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  검색 시각 {new Date(result.searchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                  {filterLabel(activeFilter)} {visibleOpportunities.length}/{metrics.all}
                </span>
                {activeFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => applyFilter("all")}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-sky-200 hover:text-sky-800"
                  >
                    전체 보기
                  </button>
                ) : null}
                <span className="text-sm font-medium text-zinc-600">확장 키워드 {result.expandedKeywords.length}개</span>
              </div>
            </div>

            {result.warnings.length > 0 ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            {registerMessage ? (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
                {registerMessage}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              {visibleOpportunities.map((item) => (
                <GrantOpportunityCard
                  key={item.id}
                  item={item}
                  isRegistered={registeredIds.has(item.id)}
                  isRegistering={registeringId === item.id}
                  isExcluding={excludingId === item.id}
                  isActionBusy={Boolean(registeringId || excludingId)}
                  onRegister={() => registerCandidate(item)}
                  onExclude={() => excludeOpportunity(item)}
                />
              ))}
              {visibleOpportunities.length === 0 ? (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                  현재 필터 조건에 맞는 후보가 없습니다. 다른 지표를 선택하거나 확장 키워드를 조정해 다시 검색하세요.
                </div>
              ) : null}
            </div>
          </section>

          <details className="rounded-lg border border-zinc-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-800">검색 출처 {result.sources.length}개</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {result.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm transition hover:border-sky-200 hover:bg-sky-50"
                >
                  <span className="font-semibold text-zinc-950">{source.name}</span>
                  <span className="mt-1 block text-zinc-600">{source.role}</span>
                </a>
              ))}
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}

function removeOpportunityFromResult(current: GrantSearchResponse | null, opportunityId: string) {
  if (!current) return current;
  const opportunities = current.opportunities.filter((candidate) => candidate.id !== opportunityId);
  return {
    ...current,
    entitySummary: summarizeVisibleEntities(opportunities),
    opportunities,
  };
}

function summarizeVisibleEntities(opportunities: GrantOpportunity[]): Record<GrantEntityType, number> {
  return {
    school: opportunities.filter((item) => item.eligibleEntities.includes("school")).length,
    hospital: opportunities.filter((item) => item.eligibleEntities.includes("hospital")).length,
    company: opportunities.filter((item) => item.eligibleEntities.includes("company")).length,
    graduate: opportunities.filter((item) => item.eligibleEntities.includes("graduate")).length,
    postdoc: opportunities.filter((item) => item.eligibleEntities.includes("postdoc")).length,
  };
}

function GrantMetric({
  title,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  title: string;
  value: number;
  icon: typeof Search;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border bg-white p-4 text-left transition hover:border-sky-300 hover:shadow-sm ${
        active ? "border-sky-300 ring-2 ring-sky-100" : "border-zinc-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ${tone}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-500">{title}</p>
          <p className="text-2xl font-semibold text-zinc-950">{value}</p>
        </div>
      </div>
    </button>
  );
}

function GrantOpportunityCard({
  item,
  isRegistered,
  isRegistering,
  isExcluding,
  isActionBusy,
  onRegister,
  onExclude,
}: {
  item: GrantOpportunity;
  isRegistered: boolean;
  isRegistering: boolean;
  isExcluding: boolean;
  isActionBusy: boolean;
  onRegister: () => void;
  onExclude: () => void;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(item.status)}`}>
              {item.statusLabel}
            </span>
            {item.dDay !== null ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                D-{item.dDay}
              </span>
            ) : null}
            <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
              관련도 {Math.round(item.relevanceScore * 100)}%
            </span>
          </div>
          <h4 className="mt-2 text-base font-semibold leading-6 text-zinc-950">{item.title}</h4>
          <p className="mt-1 text-sm text-zinc-600">
            {[item.ministry, item.agency, item.noticeNumber].filter(Boolean).join(" · ") || item.source}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onRegister}
            disabled={isRegistered || isRegistering || isExcluding || isActionBusy}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ClipboardCheck className="h-4 w-4" aria-hidden />}
            {isRegistered ? "등록됨" : "지원후보 등록"}
          </button>
          <button
            type="button"
            onClick={onExclude}
            disabled={isRegistering || isExcluding || isActionBusy}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
          >
            {isExcluding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            배제
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:border-sky-300 hover:text-sky-800"
          >
            원문
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.1fr]">
        <div className="rounded-md bg-zinc-50 p-3">
          <p className="text-xs font-semibold text-zinc-500">접수 기간</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">
            {formatDate(item.applicationStart)} - {formatDate(item.applicationEnd)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{item.solicitationType ?? "유형 확인 필요"}</p>
        </div>
        <div className="rounded-md bg-zinc-50 p-3">
          <p className="text-xs font-semibold text-zinc-500">지원 가능 기관</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">{item.eligibleEntities.map(entityLabel).join(" · ")}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{item.eligibilityNote}</p>
        </div>
        <div className="rounded-md bg-zinc-50 p-3">
          <p className="text-xs font-semibold text-zinc-500">주제 매칭</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">{item.expandedKeywords.slice(0, 5).join(", ") || "직접 매칭 없음"}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{item.relevanceReason}</p>
        </div>
      </div>

      {item.rfpPreview ? <SearchRfpPreview preview={item.rfpPreview} /> : null}

      {!item.rfpPreview && item.rfpPreviewError ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          <span className="font-semibold">RFP/공고문 자동요약 실패:</span> {item.rfpPreviewError}
        </div>
      ) : null}

      {item.excerpt ? (
        <details className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-700">공고 원문 일부</summary>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-zinc-600">{item.excerpt}</p>
        </details>
      ) : null}

      <details className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-800">
          <FileText className="h-4 w-4" aria-hidden />
          준비 체크
        </summary>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-zinc-700">
          {item.actionItems.map((action) => (
            <li key={action} className="flex gap-2">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function SearchRfpPreview({ preview }: { preview: GrantOpportunityRfpPreview }) {
  const documentLinks = preview.documentLinks?.length
    ? preview.documentLinks.slice(0, 4)
    : preview.documentUrl
      ? [{ fileName: preview.fileName, url: preview.documentUrl, label: preview.documentKindLabel }]
      : [];

  return (
    <section className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-950">RFP/공고문 핵심 자동요약</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-5 text-emerald-900">
            <span className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 font-semibold">
              {preview.documentKindLabel}
            </span>
            <span>{preview.fileName} · {preview.fileType.toUpperCase()}</span>
          </div>
        </div>
        {preview.concerns.length > 0 ? (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
            원문 확인 필요
          </span>
        ) : null}
      </div>

      {documentLinks.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {documentLinks.map((link) => (
            <a
              key={`${link.url}:${link.fileName}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 max-w-full items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
              title={link.fileName}
            >
              <span className="truncate">{link.label}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 xl:grid-cols-4">
        <RfpPreviewFact title="연구기간" value={preview.researchPeriod.value} evidence={preview.researchPeriod.evidence} />
        <RfpPreviewFact title="연구비" value={preview.funding.value} evidence={preview.funding.evidence} />
        <RfpPreviewFact title="핵심 연구목표" value={preview.mainResearchObjective.value} evidence={preview.mainResearchObjective.evidence} />
        <RfpPreviewFact title="3책5공" value={preview.threeBookFiveProjectRule.value} evidence={preview.threeBookFiveProjectRule.evidence} />
      </div>

      <KeywordRow title="매칭 키워드" items={preview.matchedKeywords} />
      <KeywordRow title="핵심 단어" items={preview.coreKeywords} />
      <KeywordRow title="필수 서류/행정 신호" items={preview.documentSignals} />
      <KeywordRow title="마감/접수 신호" items={preview.deadlineSignals} />

      {preview.goals.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-sm leading-6 text-emerald-950">
          {preview.goals.slice(0, 3).map((goal) => (
            <li key={goal} className="flex gap-2">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              <span>{goal}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RfpPreviewFact({ title, value }: { title: string; value: string; evidence: string | null }) {
  return (
    <div className="rounded-md border border-emerald-100 bg-white p-2">
      <p className="text-xs font-semibold text-emerald-700">{title}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-zinc-950">{value || "원문 확인 필요"}</p>
    </div>
  );
}

function KeywordRow({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="mt-2 text-xs leading-5 text-emerald-950">
      <span className="font-semibold">{title}: </span>
      {items.slice(0, 8).join(" · ")}
    </p>
  );
}
