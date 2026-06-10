"use client";

import {
  Archive,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Layers3,
  ListChecks,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Stethoscope,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { seedProjects } from "@/lib/thesis-seed";
import type {
  ThesisKeyJournalCandidate,
  ThesisKeyJournalSearchResult,
  ThesisKeyJournalSection,
} from "@/lib/thesis-key-journals";

type ProjectFolder = { type: string; present: boolean; fileCount: number };
type ReferenceBenchmark = {
  sourceType: string;
  title: string;
  journal: string;
  year: string;
  url: string;
  driveUrl?: string;
  gapCheck: string;
};
type ThesisProject = {
  id: string;
  title: string;
  rootFolder: "1_Thesis" | "2_Thesis Completed";
  driveUrl: string;
  type: "experimental" | "clinical" | "review" | "meta_analysis" | "ai_ml" | "unknown";
  status:
    | "candidate"
    | "ready_to_write"
    | "manuscript_writing"
    | "submitted"
    | "revision"
    | "completed_archived"
    | "on_hold";
  priority: string;
  potential: string;
  targetJournal: string;
  centralClaim: string;
  nextAction: string;
  latestThesisDate: string;
  latestThesisFile: string;
  latestDataDate: string;
  latestDataFile: string;
  thesisFileNames: string[];
  dataFileNames: string[];
  versionBasis: string;
  structureNote?: string;
  referenceBenchmarks?: ReferenceBenchmark[];
  folders: ProjectFolder[];
};

type FilterKey = "all" | "active" | "writing" | "candidate" | "completed" | "high";
type DomainKey = "all" | "sci" | "clinical-neuro" | "sarcopenia" | "ai-ml" | "review-meta" | "other";
type JournalSortMode = "importance" | "latest" | "impact";
type ProjectSortKey = "priority" | "domain" | "title" | "type" | "status" | "action" | "thesis" | "target";
type SortDirection = "asc" | "desc";
type ProjectSortState = { key: ProjectSortKey; direction: SortDirection };
type ActionItem = {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
};

const projects = seedProjects as ThesisProject[];

function initialExcludedCandidates() {
  if (typeof window === "undefined") return {};

  const entries: Record<string, string[]> = {};
  for (const project of projects) {
    const saved = window.localStorage.getItem(excludedStorageKey(project.id));
    if (!saved) continue;
    try {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed)) entries[project.id] = parsed;
    } catch {
      window.localStorage.removeItem(excludedStorageKey(project.id));
    }
  }
  return entries;
}

const statusLabel: Record<ThesisProject["status"], string> = {
  candidate: "논문 후보",
  ready_to_write: "작성 준비",
  manuscript_writing: "원고 작성 중",
  submitted: "투고",
  revision: "리비전",
  completed_archived: "완료",
  on_hold: "보류",
};

const typeLabel: Record<ThesisProject["type"], string> = {
  experimental: "실험연구",
  clinical: "임상연구",
  review: "리뷰",
  meta_analysis: "메타분석",
  ai_ml: "AI/ML",
  unknown: "미분류",
};

const domainMeta: Record<DomainKey, { label: string; detail: string; icon: LucideIcon }> = {
  all: { label: "전체", detail: "모든 연구", icon: Layers3 },
  sci: { label: "SCI/신경재생", detail: "손상, 재생, scaffold, stimulation", icon: BrainCircuit },
  "clinical-neuro": { label: "임상 신경재활", detail: "SCI, TBI, stroke, rTMS, DTI", icon: Stethoscope },
  sarcopenia: { label: "Sarcopenia", detail: "근감소, aging, frailty", icon: BarChart3 },
  "ai-ml": { label: "AI/ML 분석", detail: "예측모델, single-cell, validation", icon: Sparkles },
  "review-meta": { label: "Review/Meta", detail: "evidence map, PRISMA", icon: BookOpenCheck },
  other: { label: "기타/정리필요", detail: "분류 보정 필요", icon: Target },
};

function isWritingProject(project: ThesisProject) {
  return (
    project.status === "ready_to_write" ||
    project.status === "manuscript_writing" ||
    project.folders.some((folder) => folder.type === "Thesis" && folder.fileCount > 0)
  );
}

function folderCount(project: ThesisProject, type: string) {
  return project.folders.find((folder) => folder.type === type)?.fileCount ?? 0;
}

function versionText(date: string, file: string) {
  if (!date && !file) return "파일명 선두 날짜 분석 대기";
  if (!date) return file;
  if (!file) return date;
  return `${date} · ${file}`;
}

function projectText(project: ThesisProject) {
  return [project.title, project.centralClaim, project.nextAction, project.targetJournal, ...project.thesisFileNames, ...project.dataFileNames]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function classifyDomain(project: ThesisProject): DomainKey {
  const text = projectText(project);
  if (project.type === "review" || project.type === "meta_analysis") return "review-meta";
  if (project.type === "ai_ml" || /\b(ai|ml|machine learning|prediction|single cell|deep learning)\b/i.test(text)) {
    return "ai-ml";
  }
  if (/sarcopenia|frailty|muscle|cachexia/i.test(text)) return "sarcopenia";
  if (/tbi|stroke|seizure|dti|rtms|clinical|cohort|patient/i.test(text)) return "clinical-neuro";
  if (/sci|spinal|cord|scaffold|transection|hydrogel|gabapentinoid|pregabalin|tscs|epidural/i.test(text)) {
    return "sci";
  }
  return "other";
}

function matchesFilter(project: ThesisProject, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "active") return project.rootFolder === "1_Thesis";
  if (filter === "writing") return project.rootFolder === "1_Thesis" && isWritingProject(project);
  if (filter === "candidate") return project.status === "candidate";
  if (filter === "completed") return project.rootFolder === "2_Thesis Completed";
  return project.potential === "High";
}

function dateValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectPriorityRank(project: ThesisProject) {
  let rank = project.rootFolder === "1_Thesis" ? 100 : 0;
  if (isWritingProject(project)) rank += 50;
  if (project.potential === "High") rank += 25;
  if (project.priority === "A") rank += 10;
  if (project.structureNote) rank += 4;
  return rank;
}

function compareProjects(left: ThesisProject, right: ThesisProject) {
  const rankOrder = projectPriorityRank(right) - projectPriorityRank(left);
  if (rankOrder !== 0) return rankOrder;

  const leftDate = Math.max(dateValue(left.latestThesisDate), dateValue(left.latestDataDate));
  const rightDate = Math.max(dateValue(right.latestThesisDate), dateValue(right.latestDataDate));
  if (rightDate !== leftDate) return rightDate - leftDate;

  return left.title.localeCompare(right.title);
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, ["ko", "en"], { numeric: true, sensitivity: "base" });
}

function projectSortValue(project: ThesisProject, key: ProjectSortKey) {
  if (key === "domain") return domainMeta[classifyDomain(project)].label;
  if (key === "title") return project.title;
  if (key === "type") return typeLabel[project.type];
  if (key === "status") return statusLabel[project.status];
  if (key === "action") return actionSummary(project);
  if (key === "thesis") return folderCount(project, "Thesis");
  if (key === "target") return project.targetJournal;
  return projectPriorityRank(project);
}

function compareProjectsBySort(left: ThesisProject, right: ThesisProject, sort: ProjectSortState) {
  if (sort.key === "priority") return compareProjects(left, right);

  const leftValue = projectSortValue(left, sort.key);
  const rightValue = projectSortValue(right, sort.key);
  const order =
    typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : compareText(String(leftValue), String(rightValue));

  const directedOrder = sort.direction === "asc" ? order : -order;
  return directedOrder || compareProjects(left, right);
}

function projectSortDescription(sort: ProjectSortState) {
  if (sort.key === "priority") return "추천순";
  const labels: Record<Exclude<ProjectSortKey, "priority">, string> = {
    domain: "분야",
    title: "연구명",
    type: "유형",
    status: "상태",
    action: "Next action",
    thesis: "Thesis",
    target: "Target",
  };
  return `${labels[sort.key]} ${sort.direction === "asc" ? "A-Z" : "Z-A"}`;
}

function isDataNewerThanThesis(project: ThesisProject) {
  return dateValue(project.latestDataDate) > dateValue(project.latestThesisDate);
}

function typeAction(project: ThesisProject): ActionItem {
  if (project.type === "ai_ml") {
    return {
      title: "AI/ML 검증 설계 확정",
      detail: "data leakage, train/validation/test split, external validation, calibration, explainability 지표를 먼저 고정합니다.",
      priority: "high",
    };
  }
  if (project.type === "clinical") {
    return {
      title: "임상 설계와 통계표 고정",
      detail: "cohort 정의, inclusion/exclusion, primary endpoint, covariate, missing-data plan을 target journal 기준으로 확정합니다.",
      priority: "high",
    };
  }
  if (project.type === "meta_analysis") {
    return {
      title: "PRISMA/PICO 구조 확정",
      detail: "PICO, search strategy, risk-of-bias, heterogeneity, subgroup/sensitivity analysis 표를 먼저 만듭니다.",
      priority: "high",
    };
  }
  if (project.type === "review") {
    return {
      title: "Evidence map과 figure outline 확정",
      detail: "핵심 reference를 mechanism, method, clinical implication으로 나눠 narrative figure 순서를 정합니다.",
      priority: "medium",
    };
  }
  return {
    title: "Figure sequence와 missing experiment 확정",
    detail: "target journal의 figure 수와 논리 흐름에 맞춰 필수 validation experiment, control, statistics를 먼저 결정합니다.",
    priority: "high",
  };
}

function buildActionPlan(project: ThesisProject): ActionItem[] {
  const actions: ActionItem[] = [];

  if ((project.referenceBenchmarks ?? []).length === 0) {
    actions.push({
      title: "Key journal 후보 검색",
      detail: "method, results, discussion별 최신 high-impact 후보를 PubMed에서 먼저 뽑고 필요 없는 논문을 제외합니다.",
      priority: "high",
    });
  }

  if (isDataNewerThanThesis(project)) {
    actions.push({
      title: "최신 Data를 원고에 반영",
      detail: `Data가 Thesis보다 최신입니다. ${versionText(project.latestDataDate, project.latestDataFile)} 기준으로 결과와 figure를 갱신합니다.`,
      priority: "high",
    });
  }

  if (folderCount(project, "Thesis") === 0) {
    actions.push({
      title: "Thesis 초안 파일 생성",
      detail: "Drive의 Thesis 폴더에 target journal format 기반 초안 파일을 만들고 날짜를 파일명 맨 앞에 붙입니다.",
      priority: "medium",
    });
  }

  if (!project.targetJournal || project.targetJournal === "Target journal to be selected") {
    actions.push({
      title: "Target journal 1순위 확정",
      detail: "논문의 novelty, 실험 깊이, 임상/AI/재료 성격에 따라 1순위와 2순위 journal을 나눕니다.",
      priority: "medium",
    });
  }

  actions.push(typeAction(project));

  if (actions.length < 3 && project.nextAction) {
    actions.push({
      title: "기존 next action 확인",
      detail: project.nextAction,
      priority: "low",
    });
  }

  return actions.slice(0, 4);
}

function actionSummary(project: ThesisProject) {
  return buildActionPlan(project)[0]?.title ?? project.nextAction;
}

function sectionHint(project: ThesisProject, section: ThesisKeyJournalSection) {
  if (section === "method") {
    if (project.type === "ai_ml") return "데이터 분할, 검증, 비교모델, explainability를 베껴올 수준으로 확인";
    if (project.type === "clinical") return "cohort, endpoint, covariate, missing data, statistics 구조 확인";
    return "동물/세포/재료/행동평가 method와 control 구성을 확인";
  }
  if (section === "results") {
    if (project.type === "ai_ml") return "AUC, calibration, decision curve, external validation figure 수준 확인";
    if (project.type === "clinical") return "primary/secondary outcome과 table/figure reporting 방식 확인";
    return "효과 크기, figure sequence, 통계 검정, biological validation 수준 확인";
  }
  return "limitation, mechanism, clinical translation, future direction 문장 구조 확인";
}

function buildResearchContext(project: ThesisProject) {
  const references = (project.referenceBenchmarks ?? []).flatMap((reference) => [
    `${reference.sourceType}: ${reference.title}`,
    `${reference.journal} ${reference.year}`,
    reference.gapCheck,
  ]);
  const folders = project.folders.map((folder) => `${folder.type}: ${folder.fileCount} files`);
  const thesisFiles = project.thesisFileNames.map((name) => `Thesis file: ${name}`);
  const dataFiles = project.dataFileNames.map((name) => `Data file: ${name}`);

  return [
    project.title,
    project.centralClaim,
    project.nextAction,
    project.targetJournal,
    project.latestThesisFile ? `Latest Thesis: ${project.latestThesisDate} ${project.latestThesisFile}` : "",
    project.latestDataFile ? `Latest Data: ${project.latestDataDate} ${project.latestDataFile}` : "",
    project.versionBasis,
    project.structureNote,
    ...folders,
    ...thesisFiles,
    ...dataFiles,
    ...references,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);
}

function excludedStorageKey(projectId: string) {
  return `thesis-key-journal-exclusions:${projectId}`;
}

async function readPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Request failed: ${response.status}`);
  }
  return payload;
}

export function ThesisManagementPanel() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [domainFilter, setDomainFilter] = useState<DomainKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(projects.find(isWritingProject)?.id ?? projects[0]?.id ?? "");
  const [journalResults, setJournalResults] = useState<Record<string, ThesisKeyJournalSearchResult>>({});
  const [journalLoadingId, setJournalLoadingId] = useState<string | null>(null);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [excludedCandidates, setExcludedCandidates] = useState<Record<string, string[]>>(initialExcludedCandidates);
  const [journalSortMode, setJournalSortMode] = useState<JournalSortMode>("importance");
  const [projectSort, setProjectSort] = useState<ProjectSortState>({ key: "priority", direction: "desc" });

  const activeProjects = projects.filter((project) => project.rootFolder === "1_Thesis");
  const stats = {
    total: projects.length,
    active: activeProjects.length,
    writing: activeProjects.filter(isWritingProject).length,
    high: projects.filter((project) => project.potential === "High").length,
    completed: projects.filter((project) => project.rootFolder === "2_Thesis Completed").length,
  };

  const domainCounts = useMemo(() => {
    const counts = Object.fromEntries(Object.keys(domainMeta).map((key) => [key, 0])) as Record<DomainKey, number>;
    counts.all = projects.length;
    for (const project of projects) {
      counts[classifyDomain(project)] += 1;
    }
    return counts;
  }, []);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const textMatch =
        !normalized ||
        project.title.toLowerCase().includes(normalized) ||
        project.centralClaim.toLowerCase().includes(normalized) ||
        project.targetJournal.toLowerCase().includes(normalized);
      const domainMatch = domainFilter === "all" || classifyDomain(project) === domainFilter;
      return textMatch && domainMatch && matchesFilter(project, filter);
    }).sort((left, right) => compareProjectsBySort(left, right, projectSort));
  }, [domainFilter, filter, projectSort, query]);

  const selected =
    filteredProjects.find((project) => project.id === selectedId) ??
    filteredProjects[0] ??
    projects.find((project) => project.id === selectedId) ??
    projects[0];

  async function searchKeyJournals(project: ThesisProject) {
    setJournalLoadingId(project.id);
    setJournalError(null);
    try {
      const payload = (await readPayload(
        await fetch("/api/thesis/key-journals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: project.title,
            type: project.type,
            targetJournal: project.targetJournal,
            centralClaim: project.centralClaim,
            nextAction: project.nextAction,
            researchContext: buildResearchContext(project),
          }),
        }),
      )) as ThesisKeyJournalSearchResult;
      setJournalResults((current) => ({ ...current, [project.id]: payload }));
    } catch (error) {
      setJournalError((error as Error).message);
    } finally {
      setJournalLoadingId(null);
    }
  }

  function setCandidateExcluded(projectId: string, candidateId: string, excluded: boolean) {
    setExcludedCandidates((current) => {
      const existing = new Set(current[projectId] ?? []);
      if (excluded) existing.add(candidateId);
      else existing.delete(candidateId);
      const next = { ...current, [projectId]: Array.from(existing) };
      window.localStorage.setItem(excludedStorageKey(projectId), JSON.stringify(next[projectId]));
      return next;
    });
  }

  function restoreExcluded(projectId: string) {
    setExcludedCandidates((current) => {
      const next = { ...current, [projectId]: [] };
      window.localStorage.removeItem(excludedStorageKey(projectId));
      return next;
    });
  }

  function toggleProjectSort(key: Exclude<ProjectSortKey, "priority">) {
    setProjectSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Thesis Management</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              1_Thesis 기반 논문 작성 관리
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              기존 논문·뉴스 검색 시스템은 그대로 두고, 논문 관리 탭 안에서 연구 분류, 작성 단계,
              next action, key journal 후보 선별을 관리합니다. 핵심은 연구명과 Thesis/Data의 날짜 구조를
              읽고, PubMed 검색 알고리즘으로 method/results/discussion별 참고 논문을 좁혀가는 것입니다.
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">가장 효과적인 작성 흐름</p>
            <ol className="mt-2 grid gap-1 text-sm leading-6 text-emerald-950">
              <li>1. 연구별 target journal과 central claim 확정</li>
              <li>2. method/results/discussion별 key journal 후보 검색</li>
              <li>3. 연구자가 불필요한 후보 제외</li>
              <li>4. 남은 후보로 missing experiment와 통계표 확정</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Database} label="전체 연구" value={stats.total} active={filter === "all"} onClick={() => setFilter("all")} />
        <Metric icon={FileText} label="1_Thesis" value={stats.active} active={filter === "active"} onClick={() => setFilter("active")} />
        <Metric icon={CheckCircle2} label="작성 중" value={stats.writing} active={filter === "writing"} onClick={() => setFilter("writing")} />
        <Metric icon={Target} label="High" value={stats.high} active={filter === "high"} onClick={() => setFilter("high")} />
        <Metric icon={Archive} label="완료" value={stats.completed} active={filter === "completed"} onClick={() => setFilter("completed")} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-950">분야별 연구 포트폴리오</h3>
            <p className="mt-1 text-sm text-zinc-500">
              연구명, claim, target journal을 기준으로 자동 분류합니다. 분류는 이후 사용자가 보정할 수 있게 만들 예정입니다.
            </p>
          </div>
          <p className="text-sm font-medium text-zinc-500">{filteredProjects.length}개 표시</p>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-7">
          {(Object.keys(domainMeta) as DomainKey[]).map((key) => (
            <DomainButton
              key={key}
              domainKey={key}
              active={domainFilter === key}
              count={domainCounts[key]}
              onClick={() => setDomainFilter(key)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5">
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-zinc-950">논문 프로젝트</h3>
              <p className="mt-1 text-sm text-zinc-500">
                검색 DB와 분리된 논문 작성 DB입니다. 행을 선택하면 next action과 key journal builder가 열립니다.
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">현재 정렬: {projectSortDescription(projectSort)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setProjectSort({ key: "priority", direction: "desc" })}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                  projectSort.key === "priority"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                <ArrowDownWideNarrow className="h-4 w-4" aria-hidden />
                추천순
              </button>
              <label className="flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-600 lg:min-w-80">
                <Search className="h-4 w-4" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="연구명, claim, target journal"
                  className="w-full bg-transparent text-zinc-950 outline-none"
                />
              </label>
            </div>
          </div>

          <div className="max-h-[760px] overflow-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs font-semibold text-zinc-500">
                <tr>
                  <SortableHeader label="분야" sortKey="domain" sort={projectSort} onSort={toggleProjectSort} />
                  <SortableHeader label="연구명" sortKey="title" sort={projectSort} onSort={toggleProjectSort} />
                  <SortableHeader label="유형" sortKey="type" sort={projectSort} onSort={toggleProjectSort} />
                  <SortableHeader label="상태" sortKey="status" sort={projectSort} onSort={toggleProjectSort} />
                  <SortableHeader label="Next action" sortKey="action" sort={projectSort} onSort={toggleProjectSort} />
                  <SortableHeader label="Thesis" sortKey="thesis" sort={projectSort} onSort={toggleProjectSort} />
                  <SortableHeader label="Target" sortKey="target" sort={projectSort} onSort={toggleProjectSort} />
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => {
                  const domain = classifyDomain(project);
                  return (
                    <tr
                      key={project.id}
                      onClick={() => setSelectedId(project.id)}
                      className={`cursor-pointer border-b border-zinc-100 transition hover:bg-emerald-50/50 ${
                        selected?.id === project.id ? "bg-emerald-50/70" : "bg-white"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                          {domainMeta[domain].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-zinc-950">{project.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{project.rootFolder}</p>
                        {project.structureNote ? (
                          <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            비표준 Thesis 구조
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{typeLabel[project.type]}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                          {statusLabel[project.status]}
                        </span>
                      </td>
                      <td className="max-w-64 px-4 py-3 text-zinc-700">{actionSummary(project)}</td>
                      <td className="px-4 py-3 text-zinc-700">{folderCount(project, "Thesis")} files</td>
                      <td className="max-w-56 px-4 py-3 text-zinc-700">{project.targetJournal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selected ? (
          <ProjectDetail
            project={selected}
            journalResult={journalResults[selected.id]}
            journalError={journalError}
            journalLoading={journalLoadingId === selected.id}
            excludedIds={excludedCandidates[selected.id] ?? []}
            sortMode={journalSortMode}
            onSearch={() => searchKeyJournals(selected)}
            onExclude={(candidateId) => setCandidateExcluded(selected.id, candidateId, true)}
            onRestore={() => restoreExcluded(selected.id)}
            onSortModeChange={setJournalSortMode}
          />
        ) : null}
      </section>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: Exclude<ProjectSortKey, "priority">;
  sort: ProjectSortState;
  onSort: (key: Exclude<ProjectSortKey, "priority">) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUpAZ : ArrowDownAZ) : ArrowDownWideNarrow;

  return (
    <th scope="col" className="border-b border-zinc-200 px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition ${
          active ? "bg-emerald-50 text-emerald-800" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        }`}
        title={`${label} 기준 정렬`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${active ? "text-emerald-700" : "text-zinc-400"}`} aria-hidden />
      </button>
    </th>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition ${
        active ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300"
      }`}
    >
      <Icon className="h-4 w-4 text-emerald-700" aria-hidden />
      <span className="mt-3 block text-sm font-medium text-zinc-500">{label}</span>
      <strong className="mt-1 block text-3xl font-semibold tracking-normal">{value}</strong>
    </button>
  );
}

function DomainButton({
  domainKey,
  active,
  count,
  onClick,
}: {
  domainKey: DomainKey;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const domain = domainMeta[domainKey];
  const Icon = domain.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition ${
        active ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-4 w-4 text-emerald-700" aria-hidden />
        <span className="text-lg font-semibold text-zinc-950">{count}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-950">{domain.label}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{domain.detail}</p>
    </button>
  );
}

function ProjectDetail({
  project,
  journalResult,
  journalError,
  journalLoading,
  excludedIds,
  sortMode,
  onSearch,
  onExclude,
  onRestore,
  onSortModeChange,
}: {
  project: ThesisProject;
  journalResult?: ThesisKeyJournalSearchResult;
  journalError: string | null;
  journalLoading: boolean;
  excludedIds: string[];
  sortMode: JournalSortMode;
  onSearch: () => void;
  onExclude: (candidateId: string) => void;
  onRestore: () => void;
  onSortModeChange: (mode: JournalSortMode) => void;
}) {
  const references = project.referenceBenchmarks ?? [];
  const actionPlan = buildActionPlan(project);

  return (
    <aside className="grid gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              {domainMeta[classifyDomain(project)].label} · {typeLabel[project.type]}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-normal text-zinc-950">{project.title}</h3>
          </div>
          <a
            href={project.driveUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            Drive
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>

        <div className="mt-5 grid gap-3">
          <DetailRow label="Central claim" value={project.centralClaim} />
          <DetailRow label="최신 Thesis" value={versionText(project.latestThesisDate, project.latestThesisFile)} />
          <DetailRow label="최신 Data" value={versionText(project.latestDataDate, project.latestDataFile)} />
          {project.versionBasis ? <DetailRow label="날짜 판정 기준" value={project.versionBasis} /> : null}
          {project.structureNote ? <DetailRow label="폴더 구조 메모" value={project.structureNote} /> : null}
          <DetailRow label="Target journal" value={project.targetJournal} />
        </div>

        <section className="mt-5 border-t border-zinc-200 pt-5">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-amber-700" aria-hidden />
            <p className="text-sm font-semibold text-zinc-950">Next action</p>
          </div>
          <div className="mt-3 grid gap-2">
            {actionPlan.map((item) => (
              <div key={`${item.title}-${item.detail}`} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-950">{item.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.priority === "high"
                        ? "bg-rose-50 text-rose-700"
                        : item.priority === "medium"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <BenchmarkReferences references={references} />
      </section>

      <KeyJournalBuilder
        project={project}
        result={journalResult}
        error={journalError}
        loading={journalLoading}
        excludedIds={excludedIds}
        sortMode={sortMode}
        onSearch={onSearch}
        onExclude={onExclude}
        onRestore={onRestore}
        onSortModeChange={onSortModeChange}
      />
    </aside>
  );
}

function BenchmarkReferences({ references }: { references: ReferenceBenchmark[] }) {
  return (
    <section className="mt-5 border-t border-zinc-200 pt-5">
      <p className="text-sm font-semibold text-zinc-950">기존 key journal / benchmark</p>
      {references.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          아직 연결된 benchmark reference가 없습니다. 아래 PubMed 검색으로 후보를 만들 수 있습니다.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {references.map((reference) => (
            <article key={`${reference.sourceType}-${reference.title}`} className="rounded-md border border-zinc-200 p-3">
              <p className="text-xs font-semibold text-emerald-700">
                {reference.sourceType} · {reference.journal} · {reference.year}
              </p>
              <h4 className="mt-1 text-sm font-semibold leading-5 text-zinc-950">{reference.title}</h4>
              <p className="mt-2 text-xs leading-5 text-zinc-600">{reference.gapCheck}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a href={reference.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">
                  Journal link
                </a>
                {reference.driveUrl ? (
                  <a href={reference.driveUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">
                    Drive PDF
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function KeyJournalBuilder({
  project,
  result,
  error,
  loading,
  excludedIds,
  sortMode,
  onSearch,
  onExclude,
  onRestore,
  onSortModeChange,
}: {
  project: ThesisProject;
  result?: ThesisKeyJournalSearchResult;
  error: string | null;
  loading: boolean;
  excludedIds: string[];
  sortMode: JournalSortMode;
  onSearch: () => void;
  onExclude: (candidateId: string) => void;
  onRestore: () => void;
  onSortModeChange: (mode: JournalSortMode) => void;
}) {
  const excludedSet = new Set(excludedIds);
  const excludedCount =
    result?.sections.reduce(
      (total, section) => total + section.candidates.filter((candidate) => excludedSet.has(candidate.id)).length,
      0,
    ) ?? 0;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Key Journal Builder</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">Method · Results · Discussion 후보 선별</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            연구명, central claim, Thesis/Data 파일명, 폴더 구조, 기존 benchmark까지 합쳐 검색어를 만들고
            최근 10년 PubMed를 먼저 검색합니다. 후보가 없으면 전체 기간으로 자동 확장합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-zinc-400"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          최신 후보 찾기
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {(["method", "results", "discussion"] as ThesisKeyJournalSection[]).map((section) => (
          <div key={section} className="rounded-md border border-zinc-200 p-3">
            <p className="text-sm font-semibold text-zinc-950">{sectionLabels(section)}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{sectionHint(project, section)}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 grid gap-5">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-500">검색어</p>
            <p className="mt-1 text-sm leading-6 text-zinc-800">{result.domainTerms.join(", ")}</p>
            {result.requiredTerms.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-semibold text-zinc-500">연구명 핵심 고정어</p>
                <p className="mt-1 text-sm leading-6 text-zinc-800">{result.requiredTerms.join(", ")}</p>
              </>
            ) : null}
            <p className="mt-3 text-xs font-semibold text-zinc-500">Target/high-impact journal</p>
            <p className="mt-1 text-sm leading-6 text-zinc-800">{result.targetJournals.slice(0, 10).join(", ")}</p>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              검색 범위: 최근 10년 우선, 후보가 없으면 전체 기간으로 확장 · Impact factor순은 journal impact proxy 기준
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-zinc-700">
              <ArrowDownWideNarrow className="h-4 w-4 text-emerald-700" aria-hidden />
              정렬
            </span>
            {([
              ["importance", "중요도순"],
              ["latest", "최신순"],
              ["impact", "Impact factor순"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSortModeChange(mode)}
                className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${
                  sortMode === mode
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {excludedCount > 0 ? (
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              제외 후보 {excludedCount}개 복원
            </button>
          ) : null}

          {result.sections.map((section) => (
            <KeyJournalSection
              key={section.section}
              section={section}
              excludedSet={excludedSet}
              sortMode={sortMode}
              onExclude={onExclude}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
          이 연구의 key journal은 먼저 자동 후보를 뽑고, 그 다음 연구자가 직접 빼는 방식이 가장 빠릅니다.
          남은 후보는 실험 추가 여부, 통계방법, Discussion framing을 정하는 기준 reference가 됩니다.
        </div>
      )}
    </section>
  );
}

function candidateDateValue(candidate: ThesisKeyJournalCandidate) {
  const parsed = Date.parse(candidate.publishedAt ?? candidate.year);
  if (Number.isFinite(parsed)) return parsed;
  const year = Number(candidate.year);
  return Number.isFinite(year) ? Date.UTC(year, 0, 1) : 0;
}

function sortJournalCandidates(candidates: ThesisKeyJournalCandidate[], sortMode: JournalSortMode) {
  return [...candidates].sort((left, right) => {
    if (sortMode === "latest") {
      return candidateDateValue(right) - candidateDateValue(left) || right.score - left.score;
    }
    if (sortMode === "impact") {
      return right.impactScore - left.impactScore || right.score - left.score || candidateDateValue(right) - candidateDateValue(left);
    }
    return right.score - left.score || right.impactScore - left.impactScore || candidateDateValue(right) - candidateDateValue(left);
  });
}

function KeyJournalSection({
  section,
  excludedSet,
  sortMode,
  onExclude,
}: {
  section: ThesisKeyJournalSearchResult["sections"][number];
  excludedSet: Set<string>;
  sortMode: JournalSortMode;
  onExclude: (candidateId: string) => void;
}) {
  const visibleCandidates = sortJournalCandidates(
    section.candidates.filter((candidate) => !excludedSet.has(candidate.id)),
    sortMode,
  );
  const windowLabel = section.searchWindow === "recent-10y" ? "최근 10년" : "전체 기간";

  return (
    <section className="border-t border-zinc-200 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-semibold text-zinc-950">{section.label}</h4>
          <p className="mt-1 text-xs text-zinc-500">
            {visibleCandidates.length}개 후보 · {windowLabel}
            {section.fallbackApplied ? " 확장" : ""}
          </p>
        </div>
        <a
          href={section.pubmedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
        >
          PubMed query
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      {visibleCandidates.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
          표시할 후보가 없습니다. PubMed query를 열어 검색어를 보정하거나 제외 후보를 복원하세요.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {visibleCandidates.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} onExclude={() => onExclude(candidate.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function CandidateCard({
  candidate,
  onExclude,
}: {
  candidate: ThesisKeyJournalCandidate;
  onExclude: () => void;
}) {
  return (
    <article className="rounded-md border border-zinc-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-emerald-700">
            {candidate.journal} · {candidate.year || "year n/a"} · score {candidate.score}
          </p>
          <h5 className="mt-1 text-sm font-semibold leading-5 text-zinc-950">{candidate.title}</h5>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              중요도 {candidate.score}
            </span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
              impact {candidate.impactScore} · {candidate.impactLabel}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
              {candidate.searchWindow === "recent-10y" ? "최근 10년" : "전체 기간"}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
              {candidate.searchMode === "target-journal" ? "target journal" : "broad"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onExclude}
          title="후보 제외"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-600">{candidate.rationale}</p>
      {candidate.authors.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-500">{candidate.authors.join(", ")}</p>
      ) : null}
      <a href={candidate.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-emerald-700">
        PubMed record
      </a>
    </article>
  );
}

function sectionLabels(section: ThesisKeyJournalSection) {
  if (section === "method") return "Method 기준";
  if (section === "results") return "Results 기준";
  return "Discussion 기준";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-zinc-100 pb-3">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-800">{value}</p>
    </div>
  );
}
