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
  ListChecks,
  Plus,
  Search,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MetaAnalysisPanel } from "@/components/MetaAnalysisPanel";
import { buildPubMedSearchUrl } from "@/lib/meta-analysis-pubmed";
import {
  metaStudyProjects,
  metaStudyStages,
  projectFinalPubMedQuery,
  type MetaStudyProject,
  type MetaStudyStage,
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

const databasePlan = [
  ["PubMed", "MeSH + Title/Abstract 검색식, PMID 중심 dedup"],
  ["Scopus", "TITLE-ABS-KEY 변환, DOI/title 중심 dedup"],
  ["Web of Science", "TS 검색식 변환, accession number와 DOI 보존"],
  ["Embase", "Emtree + ti/ab 변환, Embase ID 보존"],
  ["Cochrane", "CENTRAL/RIS import, source tag 보존"],
];

const methodSentences = [
  "Single-arm instrument-specific studies contributed to arm-based prevalence estimates, whereas comparative studies including two or more asymmetry groups contributed to contrast-based network meta-regression.",
  "We performed an arm-based random-effects meta-analysis of region-specific pain prevalence and an exploratory Bayesian network meta-regression to compare prespecified biomechanical asymmetry groups when studies reported two or more instrument groups.",
  "Feature-based exploratory clustering was performed to examine whether the prespecified groups showed internally coherent biomechanical profiles.",
];

export function MetaStudyWorkspace({ initialSearchQuery }: { initialSearchQuery?: string }) {
  const [selectedProjectId, setSelectedProjectId] = useState(metaStudyProjects[0]?.id ?? "new-topic");
  const [stage, setStage] = useState<MetaStudyStage>("overview");

  const selectedProject = useMemo(
    () => metaStudyProjects.find((project) => project.id === selectedProjectId),
    [selectedProjectId],
  );

  function openNewTopic() {
    setSelectedProjectId("new-topic");
    setStage("protocol");
  }

  function openProject(project: MetaStudyProject) {
    setSelectedProjectId(project.id);
    setStage("overview");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="rounded-lg border border-zinc-200 bg-white p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700">Meta studies</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">진행 중인 연구</h2>
          </div>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-emerald-50 px-2 text-sm font-semibold text-emerald-700">
            {metaStudyProjects.length}
          </span>
        </div>

        <button
          type="button"
          onClick={openNewTopic}
          className={`mt-4 flex w-full items-center gap-3 rounded-md border p-3 text-left transition ${
            selectedProjectId === "new-topic"
              ? "border-emerald-300 bg-emerald-50"
              : "border-dashed border-zinc-300 bg-white hover:border-emerald-300 hover:bg-emerald-50"
          }`}
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <span>
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
              className={`rounded-md border p-3 text-left transition ${
                selectedProjectId === project.id
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <span className="block text-sm font-semibold leading-5 text-zinc-950">{project.shortTitle}</span>
              <span className="mt-2 block text-xs leading-5 text-zinc-500">{project.status}</span>
              <span className="mt-3 block h-2 overflow-hidden rounded-full bg-zinc-100">
                <span className="block h-full bg-emerald-600" style={{ width: `${project.progress}%` }} />
              </span>
              <span className="mt-2 block text-xs font-semibold text-emerald-700">{project.progress}% designed</span>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold uppercase text-zinc-500">Operating rule</p>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            연구별 protocol, search, screening, extraction, analysis를 분리해 저장하고, 기존 검색 시스템은 건드리지 않습니다.
          </p>
        </div>
      </aside>

      <section className="min-w-0">
        {selectedProject ? (
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
        {stage === "screening" ? <ScreeningStage /> : null}
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
        title="최근 10년 우선, 부족하면 기간 제한 없이 확장합니다"
        detail="검색 결과는 중요도, 최신순, journal impact, method relevance로 정렬 가능하게 만드는 방향이 가장 효율적입니다."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {project.searchBlocks.map((block) => (
          <article key={block.label} className="rounded-md border border-zinc-200 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-700">{block.role}</p>
            <h3 className="mt-1 text-sm font-semibold text-zinc-950">{block.label}</h3>
            <p className="mt-3 rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">{block.query}</p>
          </article>
        ))}
      </div>
      <section className="grid gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 xl:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800">Final PubMed query</p>
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
            검색식 복사
          </button>
        </div>
      </section>
      <div className="grid gap-3 lg:grid-cols-5">
        {databasePlan.map(([database, detail]) => (
          <div key={database} className="rounded-md border border-zinc-200 p-3">
            <p className="text-sm font-semibold text-zinc-950">{database}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreeningStage() {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Screening"
        title="AI는 속도를 높이고, 판단은 reviewer 구조로 고정합니다"
        detail="검색 결과가 들어오면 title/abstract relevance ranking으로 먼저 정렬하고, PRISMA count와 exclusion reason을 자동 누적합니다."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {screeningRules.map(([title, detail]) => (
          <CheckCard key={title} title={title} detail={detail} />
        ))}
      </div>
    </div>
  );
}

function ExtractionStage({ project }: { project: MetaStudyProject }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Extraction"
        title="Data sheet는 분석 코드가 바로 읽을 수 있는 형태로 고정합니다"
        detail="부위별 n/total, 좌우성, recall window, pain definition, asymmetry class, covariate를 한 번에 추출합니다."
      />
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(project.extractionColumns.join(","))}
        className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
      >
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        CSV header 복사
      </button>
      <div className="flex flex-wrap gap-2">
        {project.extractionColumns.map((column) => (
          <span key={column} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
            {column}
          </span>
        ))}
      </div>
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
      <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">{detail}</p>
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
    <article className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <p className="text-sm font-semibold text-zinc-950">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
    </article>
  );
}
