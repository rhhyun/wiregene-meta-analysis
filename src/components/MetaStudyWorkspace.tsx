"use client";

import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  KeyRound,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MetaAnalysisPanel } from "@/components/MetaAnalysisPanel";
import { MetaAiSettingsPanel } from "@/components/MetaAiSettingsPanel";
import { MetaExtractionDatasetPanel } from "@/components/MetaExtractionDatasetPanel";
import { MetaFullTextAssistant } from "@/components/MetaFullTextAssistant";
import type { CurrentWiregeneUser } from "@/lib/auth-session";
import { buildPubMedSearchUrl } from "@/lib/meta-analysis-pubmed";
import {
  metaStudyProjects,
  metaStudyStages,
  projectFinalPubMedQuery,
  type MetaStudyProject,
  type MetaStudyStage,
  type MetaWorkbookSheet,
} from "@/lib/meta-projects";

const stageIcons: Record<MetaStudyStage, LucideIcon> = {
  overview: Target,
  protocol: BookOpenCheck,
  search: Search,
  screening: ListChecks,
  extraction: Database,
  analysis: BarChart3,
  manuscript: FileText,
  references: ClipboardList,
  workbench: Workflow,
};

const newTopicLocks = [
  "Review question and PICO/PEO fields",
  "Protocol-defined exposure groups",
  "Primary and secondary outcome hierarchy",
  "Database list and reproducible search log",
  "Two-reviewer screening rule and exclusion reason set",
  "Extraction schema before full-text extraction",
];

const screeningRules = [
  ["AI priority ranking", "title/abstract relevance를 빠르게 정렬하지만 최종 포함 판단은 하지 않습니다."],
  ["Two independent reviewers", "include, exclude, maybe를 독립 입력하고 conflict는 PI 또는 senior reviewer가 해결합니다."],
  ["Reason-coded exclusion", "population, exposure, outcome, design, duplicate, no full text 등 고정 사유로 PRISMA count를 누적합니다."],
  ["Full-text audit trail", "전문 검토 단계의 제외 사유와 근거 문장을 기록해 Methods와 supplement에 바로 연결합니다."],
];

const analysisSafeguards = [
  ["Primary claim", "arm-based random-effects prevalence meta-analysis로 single-arm instrument study까지 살립니다."],
  ["Comparative layer", "동일 논문 내 2개 이상 group이 있을 때만 contrast/network meta-regression에 넣습니다."],
  ["Region separation", "neck, shoulder, wrist/hand, back, TMJ/jaw outcome을 합치지 않고 각각 분석합니다."],
  ["AI/ML position", "clustering, UMAP, heatmap은 분류 타당성 검증용 exploratory analysis로 둡니다."],
];

const screeningDecisionColumns = [
  "record_id",
  "title",
  "doi",
  "pmid",
  "source_database",
  "ai_priority",
  "reviewer_1_decision",
  "reviewer_2_decision",
  "conflict",
  "final_decision",
  "exclusion_reason",
  "full_text_status",
  "notes",
];

const fullTextExclusionReasons = [
  "no region-specific pain outcome",
  "no instrument-specific data",
  "no extractable denominator",
  "biomechanics only without pain outcome",
  "review/book chapter",
  "conference abstract",
  "wrong population",
  "non-English full text",
  "RCT/intervention/treatment-effect study",
];

const workbookBoardStorageKey = "wiregene-meta-workbook-fulltext-board-v1";

const analysisReadinessRows = [
  ["Overall PRMD prevalence", "현재 61-column template에는 없음; 필요 시 overall_PRMD_n/total 추가", "Template extension candidate"],
  ["Neck prevalence", "neck_n + neck_total by mapped_asymmetry_group", "Primary region outcome"],
  ["Left/right shoulder laterality", "left_shoulder_n/total and right_shoulder_n/total", "Novelty-critical"],
  ["Left/right wrist-hand laterality", "left_wrist_hand_n/total and right_wrist_hand_n/total", "Novelty-critical"],
  ["Upper/lower back prevalence", "upper_back_n/total and lower_back_n/total", "Moderate asymmetry hypothesis"],
  ["TMJ/jaw modifier", "tmj_jaw_n + tmj_jaw_total + orofacial modifier", "Brass/woodwind sensitivity"],
  ["Meta-regression", ">=10 studies per covariate with mapped_asymmetry_group and recall_window", "Not ready until extraction count confirms"],
];

const methodSentences = [
  "Single-arm instrument-specific studies contributed to arm-based prevalence estimates, whereas comparative studies including two or more asymmetry groups contributed to contrast-based network meta-regression.",
  "We performed an arm-based random-effects meta-analysis of region-specific pain prevalence and an exploratory Bayesian network meta-regression to compare prespecified biomechanical asymmetry groups when studies reported two or more instrument groups.",
  "Feature-based exploratory clustering was performed to examine whether the prespecified groups showed internally coherent biomechanical profiles.",
];

export function MetaStudyWorkspace({
  initialSearchQuery,
  currentUser,
}: {
  initialSearchQuery?: string;
  currentUser?: CurrentWiregeneUser | null;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(metaStudyProjects[0]?.id ?? "new-topic");
  const [stage, setStage] = useState<MetaStudyStage>("overview");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [projectMenuCollapsed, setProjectMenuCollapsed] = useState(false);

  const selectedProject = useMemo(
    () => metaStudyProjects.find((project) => project.id === selectedProjectId),
    [selectedProjectId],
  );

  function openNewTopic() {
    setAiSettingsOpen(false);
    setSelectedProjectId("new-topic");
    setStage("protocol");
  }

  function openProject(project: MetaStudyProject) {
    setAiSettingsOpen(false);
    setSelectedProjectId(project.id);
    setStage("overview");
  }

  return (
    <div
      className={`grid gap-6 transition-[grid-template-columns] duration-200 ${
        projectMenuCollapsed ? "lg:grid-cols-[4.25rem_minmax(0,1fr)]" : "lg:grid-cols-[19rem_minmax(0,1fr)]"
      }`}
    >
      <aside
        className={`rounded-lg border border-zinc-200 bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto ${
          projectMenuCollapsed ? "p-2" : "p-4"
        }`}
      >
        <div className={`flex items-center gap-3 ${projectMenuCollapsed ? "justify-center" : "justify-between"}`}>
          <div className={projectMenuCollapsed ? "hidden" : undefined}>
            <p className="text-xs font-semibold uppercase text-emerald-700">Meta studies</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">진행 중인 연구</h2>
          </div>
          <span className={`h-8 min-w-8 items-center justify-center rounded-md bg-emerald-50 px-2 text-sm font-semibold text-emerald-700 ${projectMenuCollapsed ? "hidden" : "inline-flex"}`}>
            {metaStudyProjects.length}
          </span>
          <button
            type="button"
            onClick={() => setProjectMenuCollapsed((current) => !current)}
            aria-label={projectMenuCollapsed ? "Expand meta study menu" : "Collapse meta study menu"}
            title={projectMenuCollapsed ? "Expand meta study menu" : "Collapse meta study menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            {projectMenuCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        <button
          type="button"
          onClick={openNewTopic}
          title="New topic"
          className={`mt-4 flex w-full items-center rounded-md border p-3 text-left transition ${
            projectMenuCollapsed ? "justify-center" : "gap-3"
          } ${
            selectedProjectId === "new-topic"
              ? "border-emerald-300 bg-emerald-50"
              : "border-dashed border-zinc-300 bg-white hover:border-emerald-300 hover:bg-emerald-50"
          }`}
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <span className={projectMenuCollapsed ? "sr-only" : undefined}>
            <span className="block text-sm font-semibold text-zinc-950">신규 주제</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">PRISMA 검색 디자인부터 시작</span>
          </span>
        </button>

        <div className="mt-4 grid gap-2">
          {metaStudyProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => openProject(project)}
              title={project.shortTitle}
              className={`rounded-md border text-left transition ${
                projectMenuCollapsed ? "flex h-12 items-center justify-center p-0" : "p-3"
              } ${
                selectedProjectId === project.id
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              {projectMenuCollapsed ? <Database className="h-4 w-4 text-emerald-700" aria-hidden /> : null}
              <span className={projectMenuCollapsed ? "sr-only" : "block text-sm font-semibold leading-5 text-zinc-950"}>{project.shortTitle}</span>
              {!projectMenuCollapsed ? <span className="mt-2 block text-xs leading-5 text-zinc-500">{project.status}</span> : null}
              {!projectMenuCollapsed ? (
                <span className="mt-3 block h-2 overflow-hidden rounded-full bg-zinc-100">
                  <span className="block h-full bg-emerald-600" style={{ width: `${project.progress}%` }} />
                </span>
              ) : null}
              {!projectMenuCollapsed ? <span className="mt-2 block text-xs font-semibold text-emerald-700">{project.progress}% designed</span> : null}
            </button>
          ))}
        </div>

        {currentUser ? (
          <button
            type="button"
            onClick={() => setAiSettingsOpen(true)}
            title="AI settings"
            className={`mt-4 flex w-full items-center rounded-md border p-3 text-left transition ${
              projectMenuCollapsed ? "justify-center" : "gap-3"
            } ${
              aiSettingsOpen
                ? "border-emerald-300 bg-emerald-50"
                : "border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50"
            }`}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white">
              <KeyRound className="h-4 w-4" aria-hidden />
            </span>
            <span className={projectMenuCollapsed ? "sr-only" : undefined}>
              <span className="block text-sm font-semibold text-zinc-950">AI 평가 설정</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">OpenAI key / model</span>
            </span>
          </button>
        ) : null}

        <div className={`mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-3 ${projectMenuCollapsed ? "hidden" : ""}`}>
          <p className="text-xs font-semibold uppercase text-zinc-500">Operating rule</p>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            연구별 protocol, search, screening, extraction, analysis를 분리해 저장하고, 기존 검색 시스템은 건드리지 않습니다.
          </p>
        </div>
      </aside>

      <section className="min-w-0">
        {aiSettingsOpen ? (
          <MetaAiSettingsPanel />
        ) : selectedProject ? (
          <ProjectWorkspace project={selectedProject} stage={stage} setStage={setStage} initialSearchQuery={initialSearchQuery} />
        ) : (
          <NewTopicWorkspace />
        )}
      </section>
    </div>
  );
}

function ProjectWorkspace({
  project,
  stage,
  setStage,
  initialSearchQuery,
}: {
  project: MetaStudyProject;
  stage: MetaStudyStage;
  setStage: (stage: MetaStudyStage) => void;
  initialSearchQuery?: string;
}) {
  const pubMedQuery = projectFinalPubMedQuery(project);
  const pubMedUrl = buildPubMedSearchUrl(pubMedQuery);

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Active meta-analysis project</p>
            <h2 className="mt-1 max-w-4xl text-2xl font-semibold leading-tight tracking-normal text-zinc-950">
              {project.title}
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-600">{project.researchQuestion}</p>
          </div>
          <div className="grid content-start gap-3">
            <Metric label="Status" value={project.status} />
            <Metric label="Target" value={project.targetJournals.join(", ")} />
          </div>
        </div>
      </section>

      <nav className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
        {metaStudyStages.map((item) => {
          const Icon = stageIcons[item.key];
          const active = stage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setStage(item.key)}
              className={`rounded-md border p-3 text-left transition ${
                active ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4 text-emerald-700" aria-hidden />
              <span className="mt-2 block text-sm font-semibold text-zinc-950">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">{item.detail}</span>
            </button>
          );
        })}
      </nav>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        {stage === "overview" ? <OverviewStage project={project} pubMedUrl={pubMedUrl} /> : null}
        {stage === "protocol" ? <ProtocolStage project={project} /> : null}
        {stage === "search" ? <SearchStage project={project} pubMedQuery={pubMedQuery} pubMedUrl={pubMedUrl} /> : null}
        {stage === "screening" ? <ScreeningStage project={project} /> : null}
        {stage === "extraction" ? <ExtractionStage project={project} /> : null}
        {stage === "analysis" ? <AnalysisStage project={project} /> : null}
        {stage === "manuscript" ? <ManuscriptStage project={project} /> : null}
        {stage === "references" ? <ReferencesStage project={project} /> : null}
        {stage === "workbench" ? <MetaAnalysisPanel initialSearchQuery={initialSearchQuery ?? pubMedQuery} /> : null}
      </section>
    </div>
  );
}

function OverviewStage({ project, pubMedUrl }: { project: MetaStudyProject; pubMedUrl: string }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Overview"
        title="현재 연구 진행상황을 high-impact 구조로 재정렬합니다"
        detail="첨부하신 핵심 주제 파일을 기준으로, protocol-first, exposure-first, region-specific, exploratory AI 분석 구조로 정리했습니다."
      />
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">Novelty statement</p>
        <p className="mt-2 text-sm leading-6 text-zinc-700">{project.novelty}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Checklist title="즉시 개선점" items={project.immediateImprovement} />
        <Checklist title="Next action" items={project.nextActions} />
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={pubMedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          <Search className="h-4 w-4" aria-hidden />
          PubMed 검색 실행
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
        <a
          href="https://www.prisma-statement.org/prisma-2020-checklist"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
        >
          <BookOpenCheck className="h-4 w-4" aria-hidden />
          PRISMA checklist
        </a>
      </div>
    </div>
  );
}

function ProtocolStage({ project }: { project: MetaStudyProject }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="PRISMA Protocol"
        title="악기 분류보다 exposure definition을 먼저 고정합니다"
        detail="이 단계에서 분류 기준을 잠그면, 결과를 본 뒤 group을 바꿨다는 post hoc grouping 공격을 피할 수 있습니다."
      />
      <div className="grid gap-3 lg:grid-cols-4">
        <Metric label="Population" value="orchestral musicians, instrumentalists, music students/professionals" />
        <Metric label="Exposure" value="instrument-imposed postural asymmetry" />
        <Metric label="Comparator" value="low or mixed asymmetry instruments" />
        <Metric label="Outcomes" value="region-specific and laterality-specific pain prevalence" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {project.exposureGroups.map((group) => (
          <article key={group.group} className="rounded-md border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-950">{group.group}</p>
            <p className="mt-2 text-xs font-semibold uppercase text-emerald-700">{group.instruments}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{group.interpretation}</p>
          </article>
        ))}
      </div>
      <section>
        <h3 className="text-base font-semibold text-zinc-950">Biomechanical criteria</h3>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {project.exposureFeatures.map((item) => (
            <div key={item.feature} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-sm font-semibold text-zinc-950">{item.feature}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">{item.definition}</p>
            </div>
          ))}
        </div>
      </section>
      <Checklist title="Protocol lock before screening" items={newTopicLocks} />
    </div>
  );
}

function SearchStage({
  project,
  pubMedQuery,
  pubMedUrl,
}: {
  project: MetaStudyProject;
  pubMedQuery: string;
  pubMedUrl: string;
}) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Search Design"
        title="업로드 자료 기반 DB별 검색식과 PRISMA 식별 수"
        detail="PDF에는 정확한 검색식이 없고, 2026-06-07 스크린샷에만 DB별 검색식과 결과 수가 있습니다. 이 표를 protocol supplement와 PRISMA identification source로 고정합니다."
      />
      <div className="grid gap-3 lg:grid-cols-5">
        <Metric label="Records identified" value={totalSearchResults(project).toLocaleString()} />
        <Metric label="Deduplicated master" value={prismaCount(project, "Records after deduplication")} />
        <Metric label="Abstract text" value={prismaCount(project, "Records with abstract text available")} />
        <Metric label="FT article plan" value={prismaCount(project, "Full-text assessment queue")} />
        <Metric label="Active Excel PDFs" value={activeFullTextUploadCount(project).toLocaleString()} />
      </div>
      <section className="rounded-md border border-zinc-200">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Search log from uploaded screenshots</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              각 행은 검색일, DB, 정확 검색식, 결과 수, 제한 조건, export 작업을 보존합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(searchLogCsv(project))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            search log CSV 복사
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-sm">
            <thead className="bg-white text-xs uppercase text-zinc-500">
              <tr>
                <th className="border-b border-zinc-200 px-4 py-3">Database</th>
                <th className="border-b border-zinc-200 px-4 py-3">Date</th>
                <th className="border-b border-zinc-200 px-4 py-3">Records</th>
                <th className="border-b border-zinc-200 px-4 py-3">Limits / Risk</th>
                <th className="border-b border-zinc-200 px-4 py-3">Export action</th>
                <th className="border-b border-zinc-200 px-4 py-3">Query</th>
              </tr>
            </thead>
            <tbody>
              {project.searchRuns.map((run) => (
                <tr key={run.database}>
                  <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-950">{run.database}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{run.searchedAt}</td>
                  <td className="border-b border-zinc-100 px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {run.resultCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-xs leading-5 text-zinc-600">{run.limits}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-xs leading-5 text-zinc-600">{run.exportAction}</td>
                  <td className="border-b border-zinc-100 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(run.query)}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                      복사
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 xl:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800">PubMed query used by the app</p>
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-white p-4 text-xs leading-5 text-zinc-700">{pubMedQuery}</pre>
        </div>
        <div className="grid content-start gap-3">
          <a
            href={pubMedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            PubMed 열기
          </a>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(pubMedQuery)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            PubMed 검색식 복사
          </button>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">PRISMA 2020 identification table</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              1,393건은 1,652 - 259 계산값입니다. dedup log 확인 전까지 순수 duplicates라고 단정하지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(prismaCsv(project))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            PRISMA CSV 복사
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-white text-xs uppercase text-zinc-500">
              <tr>
                <th className="border-b border-zinc-200 px-4 py-3">PRISMA item</th>
                <th className="border-b border-zinc-200 px-4 py-3">n</th>
                <th className="border-b border-zinc-200 px-4 py-3">Status</th>
                <th className="border-b border-zinc-200 px-4 py-3">Source / note</th>
              </tr>
            </thead>
            <tbody>
              {project.prismaRows.map((row) => (
                <tr key={row.step}>
                  <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-950">{row.step}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">
                    {row.count === null ? "TBD" : row.count.toLocaleString()}
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-600">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">Search consistency flags</p>
        <div className="mt-2 grid gap-2 text-sm leading-6 text-amber-900 lg:grid-cols-2">
          <p>PubMed/Cochrane screenshot에는 명시적 1990-2026 제한이 보이지 않아 supplement에서 확인 필요.</p>
          <p>Cochrane 식은 다른 DB보다 좁고 orchestra/performing artist/다수 악기명이 누락되어 sensitivity flag로 표시.</p>
          <p>Embase/WoS의 horn은 Scopus/PubMed의 french horn보다 넓어 noise 가능성 있음.</p>
          <p>English limit는 PubMed/Embase만 스크린샷에 명확하며 WoS/Scopus/Cochrane은 run log 확인 필요.</p>
        </div>
      </div>
    </div>
  );
}

function ScreeningStage({ project }: { project: MetaStudyProject }) {
  const activeUploadCount = activeFullTextUploadCount(project);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Screening"
        title={`Excel 표준 workbook 기준으로 ${activeUploadCount}개 full-text PDF/Word 파일만 처리합니다`}
        detail="Summary/Search 숫자는 이전 PDF 값을 기준으로 유지하고, 실제 업로드 대상은 Core_Comparative_Obs 18개, Core_InstrumentSpecific 36개, Manual_FullText_Check 18개입니다."
      />
      <WorkbookFullTextBoard project={project} />
      <section className="rounded-md border border-zinc-200">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Full-text triage queue</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">이 표는 업로드가 필요한 3개 sheet만 active queue로 취급합니다. 나머지 Excel sheet는 audit/support/exclusion 용도입니다.</p>
          </div>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(screeningDecisionColumns.join(","))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            screening CSV header 복사
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="bg-white text-xs uppercase text-zinc-500">
              <tr>
                <th className="border-b border-zinc-200 px-4 py-3">Queue</th>
                <th className="border-b border-zinc-200 px-4 py-3">n</th>
                <th className="border-b border-zinc-200 px-4 py-3">Priority</th>
                <th className="border-b border-zinc-200 px-4 py-3">Action</th>
                <th className="border-b border-zinc-200 px-4 py-3">Decision rule</th>
              </tr>
            </thead>
            <tbody>
              {project.screeningQueue.map((item) => (
                <tr key={item.category}>
                  <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-950">{item.category}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{item.count.toLocaleString()}</td>
                  <td className="border-b border-zinc-100 px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {item.priority}
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-600">{item.action}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-600">{item.decisionRule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <Checklist title="Two-reviewer decision fields" items={screeningDecisionColumns} />
        <Checklist title="Fixed full-text exclusion reasons" items={fullTextExclusionReasons} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {screeningRules.map(([title, detail]) => (
          <CheckCard key={title} title={title} detail={detail} />
        ))}
      </div>
      <MetaFullTextAssistant
        extractionColumns={project.extractionColumns}
        focus="screening"
        worksheetOptions={fullTextWorksheetOptions(project)}
      />
      <MetaExtractionDatasetPanel extractionSections={project.extractionSections} />
    </div>
  );
}

type WorkbookBoardState = Record<
  string,
  {
    currentCount: string;
    included: string;
    excluded: string;
    notes: string;
  }
>;

function WorkbookFullTextBoard({ project }: { project: MetaStudyProject }) {
  const [board, setBoard] = useState<WorkbookBoardState>(() => loadWorkbookBoardState(project));
  const activeSheets = project.workbookSheets.filter((sheet) => sheet.uploadRequired);
  const inactiveSheets = project.workbookSheets.filter((sheet) => !sheet.uploadRequired);

  useEffect(() => {
    window.localStorage.setItem(`${workbookBoardStorageKey}:${project.id}`, JSON.stringify(board));
  }, [board, project.id]);

  const rows = activeSheets.map((sheet) => {
    const state = board[sheet.sheetName] ?? initialWorkbookSheetState(sheet);
    const currentCount = numericText(state.currentCount);
    const included = numericText(state.included);
    const excluded = numericText(state.excluded);
    const pending = Math.max(currentCount - included - excluded, 0);
    const overflow = included + excluded > currentCount;
    return { sheet, state, currentCount, included, excluded, pending, overflow };
  });

  const totals = rows.reduce(
    (accumulator, row) => ({
      current: accumulator.current + row.currentCount,
      included: accumulator.included + row.included,
      excluded: accumulator.excluded + row.excluded,
      pending: accumulator.pending + row.pending,
      overflow: accumulator.overflow || row.overflow,
    }),
    { current: 0, included: 0, excluded: 0, pending: 0, overflow: false },
  );

  function updateSheet(sheetName: string, field: keyof WorkbookBoardState[string], value: string) {
    setBoard((current) => ({
      ...current,
      [sheetName]: {
        ...(current[sheetName] ?? initialWorkbookSheetState(project.workbookSheets.find((sheet) => sheet.sheetName === sheetName))),
        [field]: field === "notes" ? value : value.replace(/[^\d]/g, ""),
      },
    }));
  }

  function resetBoard() {
    setBoard(initialWorkbookBoardState(project.workbookSheets));
  }

  function workbookBoardCsv() {
    return csvRows([
      [
        "sheet_name",
        "label",
        "starting_count",
        "current_count",
        "included",
        "excluded",
        "pending",
        "upload_required",
        "priority",
        "review_mode",
        "notes",
        "action",
        "decision_rule",
      ],
      ...project.workbookSheets.map((sheet) => {
        const state = board[sheet.sheetName] ?? initialWorkbookSheetState(sheet);
        const currentCount = numericText(state.currentCount);
        const included = numericText(state.included);
        const excluded = numericText(state.excluded);
        const pending = sheet.uploadRequired ? Math.max(currentCount - included - excluded, 0) : 0;
        return [
          sheet.sheetName,
          sheet.label,
          String(sheet.count),
          state.currentCount,
          state.included,
          state.excluded,
          String(pending),
          sheet.uploadRequired ? "yes" : "no",
          sheet.priority,
          sheet.reviewMode,
          state.notes,
          sheet.action,
          sheet.decisionRule,
        ];
      }),
    ]);
  }

  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-900">Excel workbook standard workflow</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">업로드 대상은 3개 sheet, 나머지는 audit/support로 고정</h3>
          <details className="mt-3 max-w-4xl rounded-md border border-emerald-200 bg-white/80 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Workbook rule</summary>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
            Summary의 초기 검색/PRISMA 숫자는 이전 PDF 값을 기준으로 유지합니다. 실제 full-text PDF/Word 확인 중 탈락이 생기면 아래 current/included/excluded 값을 직접 수정하고 CSV로 남깁니다.
            </p>
          </details>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(workbookBoardCsv())}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            board CSV 복사
          </button>
          <button
            type="button"
            onClick={resetBoard}
            className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            초기값
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <Metric label="Active upload files" value={totals.current.toLocaleString()} />
        <Metric label="Included draft" value={totals.included.toLocaleString()} />
        <Metric label="Excluded after full text" value={totals.excluded.toLocaleString()} />
        <Metric label="Pending review" value={totals.pending.toLocaleString()} />
      </div>

      {totals.overflow ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          included + excluded 값이 current count보다 큰 sheet가 있습니다. 입력값을 확인하세요.
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-md border border-emerald-200 bg-white">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-emerald-50 text-xs uppercase text-emerald-900">
            <tr>
              <th className="border-b border-emerald-200 px-3 py-3">Sheet</th>
              <th className="border-b border-emerald-200 px-3 py-3">Order</th>
              <th className="border-b border-emerald-200 px-3 py-3">Current</th>
              <th className="border-b border-emerald-200 px-3 py-3">Included</th>
              <th className="border-b border-emerald-200 px-3 py-3">Excluded</th>
              <th className="border-b border-emerald-200 px-3 py-3">Pending</th>
              <th className="border-b border-emerald-200 px-3 py-3">Mode</th>
              <th className="border-b border-emerald-200 px-3 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sheet, state, pending, overflow }) => (
              <tr key={sheet.sheetName} className={overflow ? "bg-rose-50" : undefined}>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <p className="font-semibold text-zinc-950">{sheet.sheetName}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{sheet.action}</p>
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {sheet.priority}
                  </span>
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <EditableCount value={state.currentCount} onChange={(value) => updateSheet(sheet.sheetName, "currentCount", value)} />
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <EditableCount value={state.included} onChange={(value) => updateSheet(sheet.sheetName, "included", value)} />
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <EditableCount value={state.excluded} onChange={(value) => updateSheet(sheet.sheetName, "excluded", value)} />
                </td>
                <td className="border-b border-zinc-100 px-3 py-3 font-semibold text-zinc-950">{pending.toLocaleString()}</td>
                <td className="border-b border-zinc-100 px-3 py-3 text-sm leading-6 text-zinc-600">
                  {sheet.reviewMode === "cautious" ? "주의깊은 판정" : "표준 판정"}
                </td>
                <td className="border-b border-zinc-100 px-3 py-3">
                  <input
                    value={state.notes}
                    onChange={(event) => updateSheet(sheet.sheetName, "notes", event.target.value)}
                    className="h-9 w-full rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="full-text 검토 메모"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-950">No-upload sheets</p>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {inactiveSheets.map((sheet) => (
            <div key={sheet.sheetName} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{sheet.sheetName}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{sheet.action}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
                  n={sheet.count}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function initialWorkbookBoardState(sheets: MetaWorkbookSheet[]) {
  return Object.fromEntries(sheets.map((sheet) => [sheet.sheetName, initialWorkbookSheetState(sheet)]));
}

function loadWorkbookBoardState(project: MetaStudyProject) {
  const initial = initialWorkbookBoardState(project.workbookSheets);
  if (typeof window === "undefined") return initial;
  const storageKey = `${workbookBoardStorageKey}:${project.id}`;
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return initial;
  try {
    return { ...initial, ...(JSON.parse(saved) as WorkbookBoardState) };
  } catch {
    window.localStorage.removeItem(storageKey);
    return initial;
  }
}

function initialWorkbookSheetState(sheet?: MetaWorkbookSheet) {
  return {
    currentCount: String(sheet?.count ?? 0),
    included: "",
    excluded: "",
    notes: "",
  };
}

function numericText(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function EditableCount({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="numeric"
      className="h-9 w-20 rounded-md border border-zinc-300 px-2 text-sm font-semibold outline-none focus:border-emerald-500"
      placeholder="0"
    />
  );
}

function ExtractionStage({ project }: { project: MetaStudyProject }) {
  const [csvText, setCsvText] = useState("");
  const validation = useMemo(() => validateExtractionCsv(csvText, project.extractionColumns), [csvText, project.extractionColumns]);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Extraction"
        title="PDF의 6개 extraction 블록을 실제 CSV 템플릿과 검증기로 고정합니다"
        detail="숫자가 있으면 원 논문 table, figure, supplement에서 denominator와 numerator를 그대로 입력하고, n/total이 없으면 quantitative synthesis에 넣지 않습니다."
      />
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(project.extractionColumns.join(","))}
        className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
      >
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        CSV header 복사
      </button>
      <div className="grid gap-3 lg:grid-cols-2">
        {project.extractionSections.map((section) => (
          <section key={section.section} className="rounded-md border border-zinc-200 p-4">
            <h3 className="text-sm font-semibold text-zinc-950">{section.section}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {section.fields.map((field) => (
                <span key={field} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                  {field}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="grid gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 lg:grid-cols-[1fr_18rem]">
        <label className="grid gap-2 text-sm font-semibold text-emerald-900">
          Extraction CSV validator
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={9}
            placeholder={`${project.extractionColumns.slice(0, 8).join(",")},...\nS001,Smith,2024,Korea,cross-sectional,120,118,orchestra sample,...`}
            className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-500"
          />
        </label>
        <div className="grid content-start gap-3">
          <Metric label="Rows checked" value={validation.rowCount.toLocaleString()} />
          <Metric label="Errors" value={validation.errors.length.toLocaleString()} />
          <Metric label="Warnings" value={validation.warnings.length.toLocaleString()} />
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(project.extractionColumns.join(","))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            header 다시 복사
          </button>
        </div>
      </section>
      {validation.errors.length > 0 || validation.warnings.length > 0 ? (
        <section className="grid gap-3 lg:grid-cols-2">
          <ValidationList title="Errors" items={validation.errors} tone="error" />
          <ValidationList title="Warnings" items={validation.warnings} tone="warning" />
        </section>
      ) : null}
      <MetaFullTextAssistant
        extractionColumns={project.extractionColumns}
        focus="extraction"
        worksheetOptions={fullTextWorksheetOptions(project)}
      />
    </div>
  );
}

function AnalysisStage({ project }: { project: MetaStudyProject }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Analysis"
        title="Primary는 prevalence MA, secondary는 network meta-regression입니다"
        detail="전통적 치료 NMA처럼 보이면 위험하므로 observational exposure comparison임을 Methods에서 분명히 합니다."
      />
      <div className="grid gap-3">
        {project.analysisLayers.map((layer) => (
          <article key={layer.layer} className="grid gap-3 rounded-md border border-zinc-200 p-4 lg:grid-cols-[10rem_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-700">{layer.layer}</p>
              <p className="mt-2 text-sm font-semibold text-zinc-950">{layer.method}</p>
            </div>
            <p className="text-sm leading-6 text-zinc-600">{layer.purpose}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {analysisSafeguards.map(([title, detail]) => (
          <CheckCard key={title} title={title} detail={detail} />
        ))}
      </div>
      <section className="rounded-md border border-zinc-200">
        <div className="border-b border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-950">Analysis readiness dashboard</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            현재는 extraction 전이므로 모든 정량 분석은 pending입니다. 각 outcome의 n/total이 들어오면 prevalence MA와 laterality 분석 가능 여부를 확인합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-white text-xs uppercase text-zinc-500">
              <tr>
                <th className="border-b border-zinc-200 px-4 py-3">Outcome</th>
                <th className="border-b border-zinc-200 px-4 py-3">Required fields</th>
                <th className="border-b border-zinc-200 px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {analysisReadinessRows.map(([outcome, required, status]) => (
                <tr key={outcome}>
                  <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-950">{outcome}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-600">{required}</td>
                  <td className="border-b border-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-600">{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ManuscriptStage({ project }: { project: MetaStudyProject }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Manuscript"
        title="Figure와 Methods 문장을 먼저 고정하면 원고 작성 속도가 빨라집니다"
        detail="high-impact journal은 novelty보다도 method reproducibility와 limitation 방어를 강하게 봅니다."
      />
      <div className="grid gap-2 lg:grid-cols-2">
        {project.manuscriptOutputs.map((output) => (
          <div key={output} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-700">
            {output}
          </div>
        ))}
      </div>
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">Methods-ready sentences</p>
        <div className="mt-3 grid gap-2">
          {methodSentences.map((sentence) => (
            <p key={sentence} className="rounded-md bg-white p-3 text-sm leading-6 text-zinc-700">
              {sentence}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function totalSearchResults(project: MetaStudyProject) {
  return project.searchRuns.reduce((total, run) => total + run.resultCount, 0);
}

function activeFullTextUploadCount(project: MetaStudyProject) {
  return project.workbookSheets
    .filter((sheet) => sheet.uploadRequired)
    .reduce((total, sheet) => total + sheet.count, 0);
}

function prismaCount(project: MetaStudyProject, step: string) {
  const row = project.prismaRows.find((candidate) => candidate.step === step);
  return row?.count === null || row?.count === undefined ? "TBD" : row.count.toLocaleString();
}

function searchLogCsv(project: MetaStudyProject) {
  return csvRows([
    ["database", "searched_at", "label", "result_count", "limits", "source", "export_action", "query"],
    ...project.searchRuns.map((run) => [
      run.database,
      run.searchedAt,
      run.label,
      String(run.resultCount),
      run.limits,
      run.source,
      run.exportAction,
      run.query,
    ]),
  ]);
}

function prismaCsv(project: MetaStudyProject) {
  const identified = totalSearchResults(project);
  const deduplicated = project.prismaRows.find((row) => row.step === "Records after deduplication")?.count ?? null;
  const removedBeforeScreening =
    typeof deduplicated === "number" ? identified - deduplicated : null;

  return csvRows([
    ["prisma_item", "n", "status", "source_note"],
    ["Records identified from databases", String(identified), "locked", "Sum of uploaded screenshot counts"],
    [
      "Records removed before screening",
      removedBeforeScreening === null ? "TBD" : String(removedBeforeScreening),
      "working",
      "Calculated as identified minus deduplicated master; do not label as pure duplicates until dedup log confirms",
    ],
    ...project.prismaRows.map((row) => [
      row.step,
      row.count === null ? "TBD" : String(row.count),
      row.status,
      row.note,
    ]),
  ]);
}

function fullTextWorksheetOptions(project: MetaStudyProject) {
  return project.workbookSheets
    .filter((sheet) => sheet.uploadRequired)
    .map((sheet) => ({
      sheetName: sheet.sheetName,
      label: sheet.label,
      reviewMode: sheet.reviewMode,
    }));
}

function csvRows(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const safeCell = cell.replaceAll('"', '""');
          return /[",\n\r]/.test(safeCell) ? `"${safeCell}"` : safeCell;
        })
        .join(","),
    )
    .join("\n");
}

function StatusBadge({ status }: { status: "locked" | "working" | "pending" }) {
  const styles = {
    locked: "bg-emerald-50 text-emerald-700",
    working: "bg-amber-50 text-amber-700",
    pending: "bg-zinc-100 text-zinc-600",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

type ExtractionValidation = {
  rowCount: number;
  errors: string[];
  warnings: string[];
};

function validateExtractionCsv(csvText: string, expectedColumns: string[]): ExtractionValidation {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rowCount: 0, errors: [], warnings: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const errors: string[] = [];
  const warnings: string[] = [];
  const required = [
    "study_id",
    "first_author",
    "year",
    "specific_instrument",
    "mapped_asymmetry_group",
    "pain_definition",
    "recall_window",
  ];
  const missingRequired = required.filter((column) => !headers.includes(column));
  if (missingRequired.length > 0) {
    errors.push(`필수 header 누락: ${missingRequired.join(", ")}`);
  }

  const unknownHeaders = headers.filter((header) => !expectedColumns.includes(header));
  if (unknownHeaders.length > 0) {
    warnings.push(`템플릿에 없는 header: ${unknownHeaders.join(", ")}`);
  }

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) {
      errors.push(`row ${rowNumber}: header ${headers.length}개와 cell ${cells.length}개가 맞지 않습니다.`);
    }

    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] ?? ""]));
    required.forEach((column) => {
      if (!headers.includes(column)) return;
      if (!row[column]?.trim()) {
        errors.push(`row ${rowNumber}: 필수값 ${column}이 비어 있습니다.`);
      }
    });

    const sampleSize = toNumber(row.sample_size_analyzed || row.sample_size_total);
    headers.forEach((header, columnIndex) => {
      if (!/(?:_n|_total)$/.test(header)) return;
      const value = cells[columnIndex] ?? "";
      if (!value.trim()) return;
      if (value.includes("%")) {
        errors.push(`row ${rowNumber}: ${header}에 percent만 있습니다. n/total 원자료를 확인하세요.`);
        return;
      }
      const parsedValue = toNumber(value);
      if (parsedValue === null) {
        errors.push(`row ${rowNumber}: ${header} 값 "${value}"는 정수 n/total로 해석할 수 없습니다.`);
        return;
      }
      if (parsedValue < 0) {
        errors.push(`row ${rowNumber}: ${header} 값이 음수입니다.`);
      }
      if (header.endsWith("_total") && sampleSize !== null && parsedValue > sampleSize) {
        warnings.push(`row ${rowNumber}: ${header}(${parsedValue})가 sample_size(${sampleSize})보다 큽니다.`);
      }
      if (!header.endsWith("_n")) return;
      const totalHeader = `${header.slice(0, -2)}_total`;
      const totalIndex = headers.indexOf(totalHeader);
      if (totalIndex < 0) return;

      const eventValue = parsedValue;
      const totalValue = toNumber(cells[totalIndex]);
      if (totalValue === null) {
        errors.push(`row ${rowNumber}: ${header}는 있지만 ${totalHeader}가 비어 있거나 숫자가 아닙니다.`);
        return;
      }
      if (eventValue > totalValue) {
        errors.push(`row ${rowNumber}: ${header}(${eventValue})가 ${totalHeader}(${totalValue})보다 큽니다.`);
      }
    });
  });

  if (lines.length === 1) {
    warnings.push("header만 있습니다. 최소 1개 study row를 붙여 넣으면 n/total 검증을 수행합니다.");
  }

  return {
    rowCount: Math.max(lines.length - 1, 0),
    errors,
    warnings,
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function toNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.0+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function ValidationList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "error" | "warning";
}) {
  const color =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section className={`rounded-md border p-4 ${color}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-sm leading-6">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6">없음</p>
      )}
    </section>
  );
}

function ReferencesStage({ project }: { project: MetaStudyProject }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="References"
        title="핵심 근거는 클릭해서 직접 확인할 수 있게 둡니다"
        detail="PRISMA, Cochrane, PRMD 고전 논문, violin/viola biomechanics, posture review를 protocol 근거로 연결합니다."
      />
      <div className="grid gap-3">
        {project.references.map((reference) => (
          <a
            key={reference.title}
            href={reference.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-zinc-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{reference.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{reference.note}</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function NewTopicWorkspace() {
  const starterQuery = "(Population terms) AND (Exposure or intervention terms) AND (Outcome terms)";

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <StageHeader
          eyebrow="New meta-analysis topic"
          title="신규 주제는 PRISMA 검색 디자인부터 시작합니다"
          detail="새 연구를 클릭하면 바로 주제 질문, inclusion/exclusion, 검색 블록, extraction schema를 잠그는 순서로 진행합니다."
        />
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <Metric label="1. Question" value="PICO/PEO, review type, target journal을 먼저 정의" />
          <Metric label="2. Protocol" value="eligibility, outcome hierarchy, risk of bias, synthesis plan 고정" />
          <Metric label="3. Search" value="PubMed/Scopus/WoS/Embase/Cochrane 검색식과 기간 전략 작성" />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <Checklist title="PRISMA start locks" items={newTopicLocks} />
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Starter query skeleton</p>
            <pre className="mt-3 rounded-md bg-white p-3 text-sm text-zinc-700">{starterQuery}</pre>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(starterQuery)}
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              skeleton 복사
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StageHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-emerald-700">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-semibold tracking-normal text-zinc-950">{title}</h3>
      <details className="mt-3 max-w-4xl rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700">Stage note</summary>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
      </details>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-zinc-950">{value}</p>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border border-zinc-200 p-4">
      <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm leading-6 text-zinc-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CheckCard({ title, detail }: { title: string; detail: string }) {
  return (
    <details className="rounded-md border border-zinc-200 p-4">
      <summary className="flex cursor-pointer list-none items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <p className="text-sm font-semibold text-zinc-950">{title}</p>
      </summary>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
    </details>
  );
}
