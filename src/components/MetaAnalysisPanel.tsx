"use client";

import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  ListChecks,
  Search,
  Server,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import {
  buildPubMedSearchUrl,
  buildSystematicPubMedQuery,
  pubMedSystematicBlocks,
  type PubMedQueryBlock,
} from "@/lib/meta-analysis-pubmed";
import { summarizeImportedRecords, type ImportSummary } from "@/lib/meta-analysis-records";

type StageKey = "project" | "protocol" | "search" | "screening" | "extraction" | "analysis" | "manuscript";

type StageMeta = {
  key: StageKey;
  label: string;
  detail: string;
  icon: LucideIcon;
};

type PubMedCountState = {
  label: string;
  status: "idle" | "loading" | "success" | "error";
  count?: number;
  error?: string;
};

const stageMeta: StageMeta[] = [
  { key: "project", label: "Project", detail: "주제·질문·PICO", icon: Target },
  { key: "protocol", label: "Protocol", detail: "PRISMA·분류 기준", icon: BookOpenCheck },
  { key: "search", label: "Search", detail: "검색식·반입·dedup", icon: Search },
  { key: "screening", label: "Screening", detail: "논문 선별", icon: ListChecks },
  { key: "extraction", label: "Extraction", detail: "Excel 추출", icon: Database },
  { key: "analysis", label: "Analysis", detail: "MA·meta-regression", icon: BarChart3 },
  { key: "manuscript", label: "Manuscript", detail: "Figure·Table·원고", icon: FileText },
];

const searchBlocks = [
  {
    label: "Musician terms",
    terms: "musician OR instrumentalist OR orchestra OR performing artist",
  },
  {
    label: "Instrument terms",
    terms:
      "violin OR viola OR cello OR double bass OR flute OR guitar OR mandolin OR clarinet OR oboe OR bassoon OR trumpet OR trombone OR horn OR percussion OR piano OR harp",
  },
  {
    label: "Musculoskeletal terms",
    terms: "musculoskeletal OR pain OR PRMD OR playing-related OR overuse OR injury OR disorder",
  },
  {
    label: "Anatomical terms",
    terms: "neck OR shoulder OR elbow OR wrist OR hand OR back OR lumbar OR thoracic OR jaw OR temporomandibular",
  },
];

const classificationGroups = [
  {
    group: "Group 1: High postural asymmetry",
    instruments: "violin, viola, flute",
    definition: "지속적인 두경부 회전/측굴, 견갑대 비대칭, 일측 상지 부하가 뚜렷한 악기군",
    rule: "Asymmetry score >= 6",
    safeguard: "논문 선별 전 protocol에 고정하고, extraction에서 classification_basis를 기록",
  },
  {
    group: "Group 2: Moderate postural asymmetry / seated axial-load group",
    instruments: "cello, double bass, harp",
    definition: "비대칭은 있으나 목-어깨 고정 비대칭은 상대적으로 낮고 체간·요추 부하가 중요한 악기군",
    rule: "Asymmetry score 3-5",
    safeguard: "체간 회전/측굴과 seated axial load 근거를 classification_notes에 기록",
  },
  {
    group: "Group 3: Low or mixed asymmetry / comparatively neutral group",
    instruments: "piano, percussion, brass instruments",
    definition: "양측 사용 또는 비교적 정중 자세가 많지만, brass는 구강-안면/TMJ 부하 modifier를 별도로 가짐",
    rule: "Asymmetry score 0-2",
    safeguard: "brass는 low postural asymmetry + orofacial modifier=yes로 별도 표기",
  },
];

const classificationFeatures = [
  ["Cervical asymmetry", "연주 중 지속적 neck rotation 또는 lateral flexion"],
  ["Shoulder asymmetry", "일측 shoulder elevation/abduction 또는 scapular loading"],
  ["Trunk asymmetry", "seated/standing posture에서 지속적 체간 회전 또는 측굴"],
  ["Unilateral upper-limb dominance", "한쪽 상지가 주로 fine motor 또는 load-bearing 역할"],
  ["EMG asymmetry", "좌우 forearm, shoulder, cervical EMG 차이가 보고된 경우"],
  ["Orofacial/TMJ load", "embouchure, jaw, lip pressure가 주요 부하인 경우, 점수 합산 대신 modifier로 처리"],
];

const featureMatrix = [
  ["Violin", "2", "2", "1", "2", "2", "0"],
  ["Viola", "2", "2", "1", "2", "2", "0"],
  ["Flute", "2", "2", "1", "2", "1", "1"],
  ["Cello", "1", "1", "2", "1", "1", "0"],
  ["Double bass", "1", "1", "2", "1", "1", "0"],
  ["Harp", "1", "1", "2", "2", "1", "0"],
  ["Piano", "0", "0-1", "0-1", "1", "0-1", "0"],
  ["Percussion", "0-1", "1", "0-1", "1", "0-1", "0"],
  ["Brass", "0-1", "0-1", "0", "1", "0-1", "2"],
];

const extractionColumns = [
  "study_id",
  "first_author",
  "year",
  "country",
  "design",
  "sample_size_total",
  "patient_group",
  "instrument_group",
  "specific_instrument",
  "biomechanical_group",
  "asymmetry_score",
  "orofacial_modifier",
  "classification_basis",
  "classification_notes",
  "professional_status",
  "mean_age",
  "female_percent",
  "playing_hours",
  "years_experience",
  "recall_window",
  "pain_definition",
  "neck_n",
  "neck_total",
  "left_shoulder_n",
  "left_shoulder_total",
  "right_shoulder_n",
  "right_shoulder_total",
  "left_wrist_hand_n",
  "left_wrist_hand_total",
  "right_wrist_hand_n",
  "right_wrist_hand_total",
  "upper_back_n",
  "lower_back_n",
  "tmj_jaw_n",
  "pain_intensity_mean",
  "pain_intensity_sd",
  "performance_interference",
  "risk_factor_available",
  "adjusted_OR",
  "adjustment_covariates",
];

const analysisPlan = [
  ["Overall PRMD prevalence", "전체 playing-related musculoskeletal pain 유병률을 random-effects model로 추정합니다."],
  ["Region-specific prevalence", "neck, shoulder, elbow, wrist/hand, back, TMJ/jaw 부위별 pooled prevalence를 산출합니다."],
  ["Prespecified biomechanical subgroup", "high, moderate, low/mixed postural asymmetry group 간 유병률 차이를 비교합니다."],
  ["Orofacial modifier analysis", "brass/reed 등 구강-안면 부하가 있는 악기는 TMJ/jaw outcome에서 modifier로 평가합니다."],
  ["Laterality analysis", "left shoulder vs right shoulder, left wrist/hand vs right wrist/hand 좌우 차이를 분석합니다."],
  ["Meta-regression", "asymmetry score, recall window, professional status, female proportion, playing hours, study year를 검토합니다."],
  ["Sensitivity analysis", "high risk-of-bias 제외, recall window 분리, professional-only studies 분석을 수행합니다."],
  ["Exploratory AI pattern", "body map, heatmap, clustering, co-occurrence network는 exploratory analysis로 명시합니다."],
];

const manuscriptPlan = [
  ["Figure 1", "PRISMA 2020 flow diagram"],
  ["Figure 2", "instrument group and biomechanical classification evidence map"],
  ["Figure 3", "overall and region-specific prevalence forest plots"],
  ["Figure 4", "instrument biomechanical group pooled prevalence heatmap"],
  ["Figure 5", "shoulder/wrist-hand laterality plot"],
  ["Figure 6", "exploratory pain signature clustering or body-map visualization"],
  ["Table 1", "included study characteristics"],
  ["Table 2", "prespecified biomechanical asymmetry classification and rationale"],
  ["Table 3", "region-specific pooled prevalence"],
  ["Table 4", "subgroup/meta-regression/sensitivity summary"],
];

const storagePlan = [
  {
    label: "Primary repository",
    title: "Google Drive",
    detail: "프로토콜, 검색 로그, screening/extraction CSV, 분석 산출물, manuscript draft를 공동 작업 저장소로 관리합니다.",
    icon: Database,
  },
  {
    label: "Backup mirror",
    title: "Synology",
    detail: "Google Drive 저장소를 정기적으로 복제하고, 원본 보호, 대용량 figure/raw file archive 용도로 사용합니다.",
    icon: Server,
  },
  {
    label: "Reference manager",
    title: "Zotero",
    detail: "포함/제외 후보 문헌과 최종 included studies를 분야별 collection으로 분리해 관리합니다.",
    icon: BookOpenCheck,
  },
];

const databaseAcquisitionPlan = [
  {
    database: "PubMed",
    access: "NCBI PubMed direct",
    automation: "원 PubMed에서 실행, NBIB/RIS 반입, PMID/DOI 기반 dedup",
    status: "현재 실행 가능",
  },
  {
    database: "Scopus",
    access: "Elsevier API key 또는 CSV/RIS export",
    automation: "기관 권한이 있으면 API harvest, 없으면 export 파일 반입",
    status: "API/import 준비",
  },
  {
    database: "Web of Science",
    access: "Clarivate API key 또는 Excel/RIS export",
    automation: "Accession number, DOI, title 정규화 후 dedup",
    status: "API/import 준비",
  },
  {
    database: "Embase",
    access: "Elsevier Embase API/OAuth 또는 RIS export",
    automation: "Emtree 검색식 보존, DOI/PMID/Embase ID dedup",
    status: "API/import 준비",
  },
  {
    database: "Cochrane",
    access: "CENTRAL/Cochrane RIS export",
    automation: "trial/review reference를 source tag와 함께 반입",
    status: "import 준비",
  },
];

const prismaAutomationSteps = [
  ["1. Search log", "검색일, DB, 검색식, 실행자, export 파일명을 protocol log로 저장"],
  ["2. Normalize", "RIS/BibTeX/CSV/NBIB를 title, DOI, PMID, year, source DB 필드로 표준화"],
  ["3. Deduplicate", "DOI 우선, PMID/Accession ID 다음, 마지막으로 normalized title 기준 중복 제거"],
  ["4. Screening", "title/abstract 우선순위와 포함/제외 사유를 PRISMA count로 누적"],
  ["5. Full text", "전문 검토 제외 사유를 고정 목록으로 기록해 PRISMA 2020 flow에 연결"],
];

function buildCombinedQuery() {
  return searchBlocks.map((block) => `(${block.terms})`).join(" AND ");
}

function databaseSearchString(database: string, query: string) {
  if (database === "PubMed") {
    return `${query} NOT (animals[MeSH Terms] NOT humans[MeSH Terms])`;
  }
  if (database === "Scopus") {
    return `TITLE-ABS-KEY(${query}) AND (PUBYEAR > 1989)`;
  }
  if (database === "Web of Science") {
    return `TS=(${query})`;
  }
  if (database === "Cochrane") {
    return searchBlocks.map((block, index) => `#${index + 1} ${block.terms}`).join("\n") + "\n#5 #1 AND #2 AND #3 AND #4";
  }
  if (database === "Embase") {
    return `('musician'/exp OR musician*:ti,ab OR instrumentalist*:ti,ab OR orchestra*:ti,ab OR 'performing artist':ti,ab) AND (${searchBlocks[1].terms}) AND (${searchBlocks[2].terms}) AND (${searchBlocks[3].terms})`;
  }
  return query;
}

function scoreRecord(record: string) {
  const keywords = [
    "musician",
    "instrumentalist",
    "orchestra",
    "violin",
    "viola",
    "cello",
    "flute",
    "pain",
    "musculoskeletal",
    "prmd",
    "neck",
    "shoulder",
    "wrist",
    "hand",
    "back",
    "jaw",
  ];
  const lower = record.toLowerCase();
  return keywords.reduce((score, keyword) => score + (lower.includes(keyword) ? 1 : 0), 0);
}

export function MetaAnalysisPanel({ initialSearchQuery }: { initialSearchQuery?: string }) {
  const initialQuery = initialSearchQuery?.trim();
  const [stage, setStage] = useState<StageKey>(initialQuery ? "search" : "project");
  const [database, setDatabase] = useState("PubMed");
  const [query, setQuery] = useState(initialQuery || buildCombinedQuery());
  const [pubMedQuery, setPubMedQuery] = useState(initialQuery || buildSystematicPubMedQuery());
  const [pubMedCount, setPubMedCount] = useState<PubMedCountState>({
    label: "Final PubMed query",
    status: "idle",
  });
  const [records, setRecords] = useState("");

  const databaseQuery = useMemo(
    () => (database === "PubMed" ? pubMedQuery : databaseSearchString(database, query)),
    [database, pubMedQuery, query],
  );
  const pubMedUrl = useMemo(() => buildPubMedSearchUrl(pubMedQuery), [pubMedQuery]);
  const importSummary = useMemo(() => summarizeImportedRecords(records), [records]);
  const rankedRecords = useMemo(
    () =>
      importSummary.uniqueRecords
        .map((record) => {
          const recordText = `${record.title}\n${record.raw}`;
          const score = scoreRecord(recordText);
          return {
            record: record.title,
            score,
            decision: score >= 6 ? "Include priority" : score >= 3 ? "Maybe" : "Low priority",
          };
        })
        .sort((left, right) => right.score - left.score),
    [importSummary],
  );

  function openPubMedDirect(nextQuery = pubMedQuery) {
    window.open(buildPubMedSearchUrl(nextQuery), "_blank", "noopener,noreferrer");
  }

  function copyText(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  async function checkPubMedCount(nextQuery: string, label: string) {
    setPubMedCount({ label, status: "loading" });
    try {
      const response = await fetch("/api/meta-analysis/pubmed/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery }),
      });
      const payload = (await response.json()) as { count?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "PubMed count check failed.");
      }
      setPubMedCount({ label, status: "success", count: payload.count ?? 0 });
    } catch (error) {
      setPubMedCount({
        label,
        status: "error",
        error: error instanceof Error ? error.message : "PubMed count check failed.",
      });
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Meta-analysis Pipeline</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              메타분석·AI 논문 작성 워크스페이스
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              검색, protocol, screening, extraction, prevalence meta-analysis, laterality analysis, figure/table,
              원고 작성을 한 화면에서 이어갑니다. 이번 악기 통증 연구는 NMA가 아니라 prevalence MA와 subgroup/meta-regression 구조로 관리합니다.
            </p>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => openPubMedDirect()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              <Search className="h-4 w-4" aria-hidden />
              NCBI PubMed 직접 열기
            </button>
            <button
              type="button"
              onClick={() => copyText(databaseQuery)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              현재 검색식 복사
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {storagePlan.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-500">{item.label}</p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-950">{item.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{item.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 lg:grid-cols-7">
        {stageMeta.map((item) => (
          <StageButton key={item.key} item={item} active={stage === item.key} onClick={() => setStage(item.key)} />
        ))}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">{renderStage()}</section>
    </div>
  );

  function renderStage() {
    if (stage === "project") return <ProjectStage />;
    if (stage === "protocol") return <ProtocolStage />;
    if (stage === "search") {
      return (
        <SearchStage
          database={database}
          databaseQuery={databaseQuery}
          importSummary={importSummary}
          pubMedCount={pubMedCount}
          pubMedQuery={pubMedQuery}
          pubMedUrl={pubMedUrl}
          query={query}
          records={records}
          checkPubMedCount={checkPubMedCount}
          setDatabase={setDatabase}
          setPubMedQuery={setPubMedQuery}
          setQuery={setQuery}
          setRecords={setRecords}
          copyText={copyText}
          goToScreening={() => setStage("screening")}
          openPubMedDirect={openPubMedDirect}
        />
      );
    }
    if (stage === "screening") {
      return <ScreeningStage records={records} rankedRecords={rankedRecords} setRecords={setRecords} />;
    }
    if (stage === "extraction") return <ExtractionStage copyText={copyText} />;
    if (stage === "analysis") return <AnalysisStage />;
    return <ManuscriptStage />;
  }
}

function StageButton({
  item,
  active,
  onClick,
}: {
  item: StageMeta;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition ${
        active ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <Icon className="h-4 w-4 text-emerald-700" aria-hidden />
      <span className="mt-2 block text-sm font-semibold text-zinc-950">{item.label}</span>
      <span className="mt-1 block text-xs leading-5 text-zinc-500">{item.detail}</span>
    </button>
  );
}

function ProjectStage() {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Project"
        title="Postural Asymmetry and Region-Specific PRMD in Orchestral Musicians"
        detail="이번 논문은 악기 자체가 강제하는 자세 비대칭이 통증의 전체 burden뿐 아니라 부위별·좌우별 분포를 결정하는지 평가합니다."
      />
      <div className="grid gap-3 lg:grid-cols-4">
        <InfoCard label="Population" value="orchestral musicians and instrumentalists" />
        <InfoCard label="Exposure" value="instrument-imposed postural asymmetry" />
        <InfoCard label="Comparator" value="low or mixed asymmetry instrument groups" />
        <InfoCard label="Outcome" value="region-specific and laterality-specific pain prevalence" />
      </div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">Novelty statement</p>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Instrument-imposed postural asymmetry may determine not only the overall burden of playing-related
          musculoskeletal pain but also its anatomical and laterality-specific distribution.
        </p>
      </div>
    </div>
  );
}

function ProtocolStage() {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Protocol"
        title="환자군/악기군 분류는 outcome 확인 전에 사전 고정합니다"
        detail="논문에서는 cluster 1-3라고 먼저 부르지 않고, prespecified biomechanical asymmetry groups로 정의합니다. Cluster analysis는 이 사전 분류가 생체역학적으로 일관적인지 확인하는 보조분석입니다."
      />

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">용어 정리</p>
        <p className="mt-2 text-sm leading-6 text-amber-950">
          이 연구의 participant는 모두 musician/instrumentalist이므로 엄밀한 의미의 환자군은 통증 유무 또는 부위별 통증 outcome으로 정의됩니다.
          주 subgroup은 환자군 자체가 아니라 악기 기반의 biomechanical exposure group입니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="border-b border-zinc-200 px-4 py-3">Prespecified group</th>
              <th className="border-b border-zinc-200 px-4 py-3">Instruments</th>
              <th className="border-b border-zinc-200 px-4 py-3">Operational definition</th>
              <th className="border-b border-zinc-200 px-4 py-3">Rule</th>
              <th className="border-b border-zinc-200 px-4 py-3">Safeguard</th>
            </tr>
          </thead>
          <tbody>
            {classificationGroups.map((row) => (
              <tr key={row.group}>
                <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-950">{row.group}</td>
                <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.instruments}</td>
                <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.definition}</td>
                <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.rule}</td>
                <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{row.safeguard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-md border border-zinc-200 p-4">
          <h4 className="text-sm font-semibold text-zinc-950">Scoring criteria</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            0 = absent/minimal, 1 = intermittent/moderate, 2 = sustained/prominent. Asymmetry score =
            cervical + shoulder + trunk + unilateral upper-limb dominance + EMG asymmetry.
          </p>
          <div className="mt-3 grid gap-2">
            {classificationFeatures.map(([feature, definition]) => (
              <div key={feature} className="rounded-md bg-zinc-50 px-3 py-2">
                <p className="text-xs font-semibold text-zinc-950">{feature}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-600">{definition}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 p-4">
          <h4 className="text-sm font-semibold text-zinc-950">Exploratory clustering guardrail</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Feature-based clustering은 사전 분류를 대체하지 않습니다. Hierarchical clustering, k-means, PCA/UMAP,
            silhouette width, bootstrap stability를 보조적으로 제시해 사전 분류의 내부 일관성을 확인합니다.
          </p>
          <div className="mt-3 grid gap-2">
            <CheckCard title="Primary wording" detail="prespecified biomechanical asymmetry groups" />
            <CheckCard title="Avoid wording" detail="cluster 1 = violin/viola/flute처럼 사후 군집처럼 보이는 표현은 피합니다." />
            <CheckCard title="Modifier" detail="brass는 low postural asymmetry but high orofacial/TMJ load로 처리합니다." />
          </div>
        </section>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="border-b border-zinc-200 px-4 py-3">Instrument</th>
              <th className="border-b border-zinc-200 px-4 py-3">Neck</th>
              <th className="border-b border-zinc-200 px-4 py-3">Shoulder</th>
              <th className="border-b border-zinc-200 px-4 py-3">Trunk</th>
              <th className="border-b border-zinc-200 px-4 py-3">Upper limb</th>
              <th className="border-b border-zinc-200 px-4 py-3">EMG</th>
              <th className="border-b border-zinc-200 px-4 py-3">Orofacial</th>
            </tr>
          </thead>
          <tbody>
            {featureMatrix.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className={`border-b border-zinc-100 px-4 py-3 ${
                      index === 0 ? "font-semibold text-zinc-950" : "text-zinc-700"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchStage({
  database,
  databaseQuery,
  importSummary,
  pubMedCount,
  pubMedQuery,
  pubMedUrl,
  query,
  records,
  checkPubMedCount,
  setDatabase,
  setPubMedQuery,
  setQuery,
  setRecords,
  copyText,
  goToScreening,
  openPubMedDirect,
}: {
  database: string;
  databaseQuery: string;
  importSummary: ImportSummary;
  pubMedCount: PubMedCountState;
  pubMedQuery: string;
  pubMedUrl: string;
  query: string;
  records: string;
  checkPubMedCount: (query: string, label: string) => Promise<void>;
  setDatabase: (value: string) => void;
  setPubMedQuery: (value: string) => void;
  setQuery: (value: string) => void;
  setRecords: (value: string) => void;
  copyText: (text: string) => void;
  goToScreening: () => void;
  openPubMedDirect: (query?: string) => void;
}) {
  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const imported = await Promise.all(
      files.map(async (file) => {
        const text = await file.text();
        return `# Source file: ${file.name}\n${text.trim()}`;
      }),
    );
    setRecords([records.trim(), ...imported].filter(Boolean).join("\n\n"));
    event.target.value = "";
  }

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Search"
        title="다중 DB 검색, 결과 반입, PRISMA 자동화"
        detail="PubMed는 NCBI PubMed로 직접 실행하고, Wiregene에는 검색 로그와 반입 결과를 남깁니다. Scopus/Web of Science/Embase/Cochrane은 기관 API 키 또는 RIS/BibTeX/CSV/NBIB export 반입으로 같은 dedup·screening·PRISMA 흐름에 연결합니다."
      />
      <section className="grid gap-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 lg:grid-cols-[1fr_18rem]">
        <label className="grid gap-2 text-sm font-semibold text-emerald-900">
          PubMed systematic review query
          <textarea
            value={pubMedQuery}
            onChange={(event) => setPubMedQuery(event.target.value)}
            rows={9}
            className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-500"
          />
        </label>
        <div className="grid content-start gap-3">
          <InfoCard label="PubMed URL" value={`${pubMedUrl.length} chars`} />
          <InfoCard label="Query length" value={`${pubMedQuery.length} chars`} />
          <button
            type="button"
            onClick={() => openPubMedDirect(pubMedQuery)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            NCBI PubMed 열기
          </button>
          <button
            type="button"
            onClick={() => void checkPubMedCount(pubMedQuery, "Final PubMed query")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Search className="h-4 w-4" aria-hidden />
            PubMed count 확인
          </button>
          <button
            type="button"
            onClick={() => copyText(pubMedQuery)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            PubMed 검색식 복사
          </button>
          <PubMedCountCard result={pubMedCount} />
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        {pubMedSystematicBlocks.map((block) => (
          <PubMedBlockCard
            key={block.key}
            block={block}
            checkPubMedCount={checkPubMedCount}
            copyText={copyText}
            openPubMedDirect={openPubMedDirect}
          />
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <label className="grid gap-2 text-sm font-semibold text-zinc-700">
          Cross-database plain query for Scopus/WoS/Embase/Cochrane conversion
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={7}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-400"
          />
        </label>
        <div className="grid content-start gap-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase text-emerald-700">Direct PubMed execution</p>
            <p className="mt-1 text-base font-semibold text-zinc-950">NCBI PubMed</p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              검색 실행은 PubMed 원 사이트로 열고, 결과는 export/import로 반입합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPubMedDirect(pubMedQuery)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            <Search className="h-4 w-4" aria-hidden />
            NCBI PubMed 실행
          </button>
          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            검색식 형식
            <select
              value={database}
              onChange={(event) => setDatabase(event.target.value)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-emerald-400"
            >
              <option value="PubMed">PubMed (NCBI direct)</option>
              <option value="Scopus">Scopus (API/import)</option>
              <option value="Web of Science">Web of Science (API/import)</option>
              <option value="Cochrane">Cochrane (RIS import)</option>
              <option value="Embase">Embase (API/import)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => copyText(databaseQuery)}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            {database} 검색식 복사
          </button>
          <p className="text-xs leading-5 text-zinc-500">
            검색식은 protocol search log에 남기고, 결과 파일은 아래 반입 상자에 붙여 넣어 dedup부터 자동 처리합니다.
          </p>
        </div>
      </div>
      <pre className="overflow-x-auto rounded-md bg-zinc-950 p-4 text-sm leading-6 text-zinc-50">{databaseQuery}</pre>
      <section className="grid gap-3 lg:grid-cols-5">
        {databaseAcquisitionPlan.map((item) => (
          <div key={item.database} className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-semibold uppercase text-zinc-500">{item.database}</p>
            <p className="mt-2 text-sm font-semibold text-zinc-950">{item.access}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">{item.automation}</p>
            <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              {item.status}
            </span>
          </div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <label className="grid gap-2 text-sm font-semibold text-zinc-700">
          Export/import records for automatic deduplication
          <textarea
            value={records}
            onChange={(event) => setRecords(event.target.value)}
            rows={8}
            placeholder="RIS, BibTeX, CSV, NBIB, or one title/abstract per line..."
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-400"
          />
        </label>
        <div className="grid content-start gap-3">
          <label className="grid gap-2 rounded-md border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            RIS/BibTeX/CSV/NBIB 파일 가져오기
            <input
              type="file"
              multiple
              accept=".ris,.bib,.csv,.nbib,.txt,text/plain,text/csv,application/x-research-info-systems"
              onChange={importFiles}
              className="text-xs font-normal text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
            />
          </label>
          <InfoCard label="Imported" value={`${importSummary.rawCount} records`} />
          <InfoCard label="After dedup" value={`${importSummary.uniqueCount} unique`} />
          <InfoCard label="Duplicates" value={`${importSummary.duplicateCount} removed`} />
          <button
            type="button"
            onClick={goToScreening}
            className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Screening으로 이동
          </button>
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-5">
        {prismaAutomationSteps.map(([title, detail]) => (
          <CheckCard key={title} title={title} detail={detail} />
        ))}
      </section>
    </div>
  );
}

function PubMedBlockCard({
  block,
  checkPubMedCount,
  copyText,
  openPubMedDirect,
}: {
  block: PubMedQueryBlock;
  checkPubMedCount: (query: string, label: string) => Promise<void>;
  copyText: (text: string) => void;
  openPubMedDirect: (query?: string) => void;
}) {
  return (
    <article className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">PubMed block</p>
          <h4 className="mt-1 text-sm font-semibold text-zinc-950">{block.label}</h4>
          <span className="mt-2 inline-flex rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
            {block.includedInFinal === false ? "Optional refinement" : "Included in final query"}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => copyText(block.query)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            title="Copy block query"
            aria-label={`${block.label} copy`}
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => openPubMedDirect(block.query)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            title="Open this block in PubMed"
            aria-label={`${block.label} open PubMed`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-3 max-h-24 overflow-y-auto rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
        {block.query}
      </p>
      <button
        type="button"
        onClick={() => void checkPubMedCount(block.query, block.label)}
        className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        block count 확인
      </button>
    </article>
  );
}

function PubMedCountCard({ result }: { result: PubMedCountState }) {
  if (result.status === "idle") {
    return (
      <div className="rounded-md border border-emerald-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase text-emerald-700">PubMed count</p>
        <p className="mt-1 text-sm leading-5 text-zinc-600">전체 query 또는 각 block의 검색 결과 수를 확인합니다.</p>
      </div>
    );
  }

  if (result.status === "loading") {
    return (
      <div className="rounded-md border border-emerald-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase text-emerald-700">PubMed count</p>
        <p className="mt-1 text-sm font-semibold text-zinc-950">{result.label}</p>
        <p className="mt-1 text-sm text-zinc-600">NCBI ESearch 확인 중...</p>
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
        <p className="text-xs font-semibold uppercase text-rose-700">PubMed count error</p>
        <p className="mt-1 text-sm font-semibold text-zinc-950">{result.label}</p>
        <p className="mt-1 text-xs leading-5 text-rose-700">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-emerald-700">PubMed count</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{result.label}</p>
      <p className="mt-1 text-2xl font-semibold text-emerald-800">{result.count?.toLocaleString() ?? 0}</p>
    </div>
  );
}

function ScreeningStage({
  records,
  rankedRecords,
  setRecords,
}: {
  records: string;
  rankedRecords: { record: string; score: number; decision: string }[];
  setRecords: (value: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Screening"
        title="Title/abstract 우선순위 triage"
        detail="검색 결과를 한 줄에 한 논문씩 붙여 넣으면 악기·통증·부위 keyword 기반으로 1차 우선순위를 계산합니다."
      />
      <label className="grid gap-2 text-sm font-semibold text-zinc-700">
        Screening records
        <textarea
          value={records}
          onChange={(event) => setRecords(event.target.value)}
          rows={7}
          placeholder="Author year title abstract..."
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-400"
        />
      </label>
      {rankedRecords.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="border-b border-zinc-200 px-4 py-3">Record</th>
                <th className="border-b border-zinc-200 px-4 py-3">Score</th>
                <th className="border-b border-zinc-200 px-4 py-3">Triage</th>
              </tr>
            </thead>
            <tbody>
              {rankedRecords.map((item) => (
                <tr key={`${item.score}-${item.record.slice(0, 40)}`}>
                  <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{item.record}</td>
                  <td className="border-b border-zinc-100 px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {item.score}
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-800">{item.decision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ExtractionStage({ copyText }: { copyText: (text: string) => void }) {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Extraction"
        title="통증 부위·좌우성·악기 분류를 같은 템플릿으로 추출합니다"
        detail="classification_basis와 classification_notes를 포함해, 사전 정의된 분류 근거와 orofacial modifier까지 함께 기록합니다."
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <CheckCard title="Protocol-defined only" detail="biomechanical_group은 protocol 단계에서 고정된 기준만 사용합니다." />
        <CheckCard title="No post hoc relabeling" detail="결과를 본 뒤 악기군을 재배치하지 않습니다." />
        <CheckCard title="Modifier field" detail="brass/reed 관련 TMJ orofacial load는 modifier로 별도 코딩합니다." />
      </div>
      <button
        type="button"
        onClick={() => copyText(extractionColumns.join(","))}
        className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
      >
        CSV header 복사
      </button>
      <div className="flex flex-wrap gap-2">
        {extractionColumns.map((column) => (
          <span key={column} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
            {column}
          </span>
        ))}
      </div>
    </div>
  );
}

function AnalysisStage() {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Analysis"
        title="Prevalence MA + subgroup + laterality + meta-regression"
        detail="이번 연구는 NMA가 아니라 prevalence meta-analysis입니다. AI/ML은 exploratory pattern analysis로 분리합니다."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {analysisPlan.map(([title, detail], index) => (
          <CheckCard key={title} title={title} detail={detail} checked={index < 4} />
        ))}
      </div>
    </div>
  );
}

function ManuscriptStage() {
  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Manuscript"
        title="Figure & Table 중심으로 원고를 조립합니다"
        detail="Methods에는 사전 정의, Results에는 정량 요약, Discussion에는 해석과 한계를 명확히 분리합니다."
      />
      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="border-b border-zinc-200 px-4 py-3">Item</th>
              <th className="border-b border-zinc-200 px-4 py-3">Content</th>
            </tr>
          </thead>
          <tbody>
            {manuscriptPlan.map(([item, content]) => (
              <tr key={item}>
                <td className="border-b border-zinc-100 px-4 py-3 font-semibold text-zinc-950">{item}</td>
                <td className="border-b border-zinc-100 px-4 py-3 text-zinc-700">{content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-zinc-950">{value}</p>
    </div>
  );
}

function CheckCard({ title, detail, checked = true }: { title: string; detail: string; checked?: boolean }) {
  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-950">{title}</p>
        {checked ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
    </div>
  );
}
