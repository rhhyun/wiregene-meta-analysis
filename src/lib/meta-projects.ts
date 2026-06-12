import { buildSystematicPubMedQuery } from "./meta-analysis-pubmed";

export type MetaStudyStage =
  | "overview"
  | "protocol"
  | "search"
  | "screening"
  | "extraction"
  | "analysis"
  | "manuscript"
  | "references"
  | "workbench";

export type MetaSearchBlock = {
  label: string;
  query: string;
  role: string;
};

export type MetaSearchRun = {
  database: string;
  searchedAt: string;
  label: string;
  query: string;
  resultCount: number;
  limits: string;
  source: string;
  exportAction: string;
};

export type MetaPrismaRow = {
  step: string;
  count: number | null;
  status: "locked" | "working" | "pending";
  note: string;
};

export type MetaScreeningQueue = {
  category: string;
  count: number;
  priority: string;
  action: string;
  decisionRule: string;
};

export type MetaExtractionSection = {
  section: string;
  fields: string[];
};

export type MetaReference = {
  title: string;
  note: string;
  url: string;
};

export type MetaStudyProject = {
  id: string;
  shortTitle: string;
  title: string;
  status: string;
  progress: number;
  sourcePath: string;
  researchQuestion: string;
  novelty: string;
  targetJournals: string[];
  immediateImprovement: string[];
  nextActions: string[];
  searchBlocks: MetaSearchBlock[];
  searchRuns: MetaSearchRun[];
  prismaRows: MetaPrismaRow[];
  screeningQueue: MetaScreeningQueue[];
  exposureGroups: {
    group: string;
    instruments: string;
    interpretation: string;
  }[];
  exposureFeatures: {
    feature: string;
    definition: string;
  }[];
  extractionColumns: string[];
  extractionSections: MetaExtractionSection[];
  analysisLayers: {
    layer: string;
    method: string;
    purpose: string;
  }[];
  manuscriptOutputs: string[];
  references: MetaReference[];
};

const pubMedTitleSearch = (title: string) =>
  `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(`"${title}"`)}`;

export const metaStudyStages: { key: MetaStudyStage; label: string; detail: string }[] = [
  { key: "overview", label: "Overview", detail: "현재 전략과 다음 작업" },
  { key: "protocol", label: "PRISMA Protocol", detail: "PICO, exposure, eligibility" },
  { key: "search", label: "Search Design", detail: "검색 블록과 DB별 검색식" },
  { key: "screening", label: "Screening", detail: "AI triage + 2 reviewer" },
  { key: "extraction", label: "Extraction", detail: "Excel schema + data lock" },
  { key: "analysis", label: "Analysis", detail: "R meta-analysis + ML" },
  { key: "manuscript", label: "Manuscript", detail: "Figures, tables, Methods" },
  { key: "references", label: "References", detail: "핵심 근거와 확인 링크" },
  { key: "workbench", label: "Automation", detail: "기존 PubMed/dedup 작업대" },
];

export const uploadedSearchRuns: MetaSearchRun[] = [
  {
    database: "PubMed",
    searchedAt: "2026-06-07",
    label: "260607 PubMed search",
    resultCount: 221,
    limits: "English; humans filter; title/abstract + MeSH; 1990-2026 implied by review plan",
    source: "Uploaded screenshot 260607 PubMed search",
    exportAction: "Export NBIB/RIS, keep PMID and DOI for deduplication",
    query: `(
  musician*[Title/Abstract]
  OR instrumentalist*[Title/Abstract]
  OR orchestra*[Title/Abstract]
  OR "performing artist*"[Title/Abstract]
)
AND
(
  violin*[Title/Abstract]
  OR viola*[Title/Abstract]
  OR cello*[Title/Abstract]
  OR "double bass"[Title/Abstract]
  OR contrabass[Title/Abstract]
  OR flute*[Title/Abstract]
  OR guitar*[Title/Abstract]
  OR mandolin*[Title/Abstract]
  OR clarinet*[Title/Abstract]
  OR oboe*[Title/Abstract]
  OR bassoon*[Title/Abstract]
  OR trumpet*[Title/Abstract]
  OR trombone*[Title/Abstract]
  OR "french horn"[Title/Abstract]
  OR percussion*[Title/Abstract]
  OR piano*[Title/Abstract]
  OR harp[Title/Abstract]
)
AND
(
  "Musculoskeletal Pain"[Mesh]
  OR "Musculoskeletal Diseases"[Mesh]
  OR pain[Title/Abstract]
  OR musculoskeletal[Title/Abstract]
  OR PRMD[Title/Abstract]
  OR "playing-related"[Title/Abstract]
  OR "playing-related musculoskeletal disorder*"[Title/Abstract]
  OR "performance-related musculoskeletal disorder*"[Title/Abstract]
  OR "performance-related pain"[Title/Abstract]
  OR "musician* pain"[Title/Abstract]
  OR overuse[Title/Abstract]
  OR injury[Title/Abstract]
  OR disorder*[Title/Abstract]
  OR "repetitive strain"[Title/Abstract]
  OR "overuse syndrome"[Title/Abstract]
)
NOT
(
  animals[MeSH Terms] NOT humans[MeSH Terms]
)
English`,
  },
  {
    database: "Web of Science",
    searchedAt: "2026-06-07",
    label: "260607 Web of Science",
    resultCount: 413,
    limits: "TS field; PY=(1990-2026)",
    source: "Uploaded screenshot 260607 Web of Science",
    exportAction: "Export full record + cited references when available; preserve accession number",
    query: `TS=(
(
musician*
OR instrumentalist*
OR orchestra*
OR "performing artist"
)
AND
(
violin*
OR viola*
OR cello*
OR "double bass"
OR contrabass
OR flute*
OR guitar*
OR mandolin*
OR clarinet*
OR oboe*
OR bassoon*
OR trumpet*
OR trombone*
OR horn
OR percussion*
OR piano*
OR harp*
)
AND
(
pain
OR musculoskeletal
OR PRMD
OR overuse
OR injury
OR disorder*
OR "playing-related"
)
)
AND PY=(1990-2026)`,
  },
  {
    database: "Scopus",
    searchedAt: "2026-06-07",
    label: "260607 Scopus search",
    resultCount: 561,
    limits: "TITLE-ABS-KEY; PUBYEAR > 1989",
    source: "Uploaded screenshot 260607 Scopus search",
    exportAction: "Export CSV/RIS with abstract, DOI, EID, title, year, source title",
    query:
      'TITLE-ABS-KEY ( musician* OR instrumentalist* OR orchestra* OR "performing artist" ) AND TITLE-ABS-KEY ( violin* OR viola* OR cello* OR "double bass" OR contrabass OR flute* OR guitar* OR mandolin* OR clarinet* OR oboe* OR bassoon* OR trumpet* OR trombone* OR "french horn" OR percussion* OR piano* OR harp* ) AND TITLE-ABS-KEY( pain OR musculoskeletal OR PRMD OR overuse OR injury OR disorder* ) AND PUBYEAR > 1989',
  },
  {
    database: "Embase",
    searchedAt: "2026-06-07",
    label: "260607 EMBASE",
    resultCount: 343,
    limits: "[english]/lim; [1990-2026]/py; ti,ab fields",
    source: "Uploaded screenshot 260607 EMBASE",
    exportAction: "Export RIS/CSV with Embase ID, DOI, abstract, Emtree terms",
    query: `(
musician*:ti,ab
OR instrumentalist*:ti,ab
OR orchestra*:ti,ab
OR "performing artist":ti,ab
)
AND
(
violin*:ti,ab
OR viola*:ti,ab
OR cello*:ti,ab
OR "double bass":ti,ab
OR contrabass:ti,ab
OR flute*:ti,ab
OR guitar*:ti,ab
OR mandolin*:ti,ab
OR clarinet*:ti,ab
OR oboe*:ti,ab
OR bassoon*:ti,ab
OR trumpet*:ti,ab
OR trombone*:ti,ab
OR horn:ti,ab
OR percussion*:ti,ab
OR piano*:ti,ab
OR harp*:ti,ab
)
AND
(
pain:ti,ab
OR musculoskeletal:ti,ab
OR PRMD:ti,ab
OR overuse:ti,ab
OR injury:ti,ab
OR disorder*:ti,ab
OR "playing-related":ti,ab
)
AND [english]/lim
AND [1990-2026]/py`,
  },
  {
    database: "Cochrane",
    searchedAt: "2026-06-07",
    label: "260607 Cochrane",
    resultCount: 114,
    limits: "Uploaded query did not show a year/language limiter; confirm in Cochrane run log",
    source: "Uploaded screenshot 260607 Cochrane",
    exportAction: "Export CENTRAL/RIS and keep source tag as Cochrane",
    query: `(
musician*
OR instrumentalist*
OR violinist*
OR violist*
OR cellist*
OR flutist*
OR pianist*
)
AND
(
PRMD
OR pain
OR "playing-related"
OR overuse
OR musculoskeletal
)`,
  },
];

export const orchestralPainPrismaRows: MetaPrismaRow[] = [
  {
    step: "Records identified from databases",
    count: 1652,
    status: "locked",
    note: "PubMed 221 + Web of Science 413 + Scopus 561 + Embase 343 + Cochrane 114",
  },
  {
    step: "Records after deduplication",
    count: 259,
    status: "locked",
    note: "260611 plan PDF: deduplicated screening records",
  },
  {
    step: "Records with PubMed/WoS/Scopus source linked",
    count: 257,
    status: "locked",
    note: "260611 plan PDF source-link status",
  },
  {
    step: "Records with abstract text available",
    count: 253,
    status: "locked",
    note: "260611 plan PDF abstract acquisition status",
  },
  {
    step: "Title/abstract strict screening completed",
    count: 253,
    status: "locked",
    note: "Strict abstract screening marked complete in plan PDF",
  },
  {
    step: "Full-text assessment queue",
    count: 82,
    status: "working",
    note: "Core 19 + instrument-specific 40 + manual full-text check 23",
  },
  {
    step: "Biomechanical/asymmetry support only",
    count: 76,
    status: "working",
    note: "Use for classification evidence, not primary quantitative synthesis",
  },
  {
    step: "Treatment/RCT/intervention excluded from primary analysis",
    count: 5,
    status: "locked",
    note: "Excluded because current review is observational prevalence/asymmetry, not treatment effect",
  },
  {
    step: "Full-text included for quantitative synthesis",
    count: null,
    status: "pending",
    note: "Pending denominator and region-specific n/total extraction",
  },
];

export const orchestralPainScreeningQueue: MetaScreeningQueue[] = [
  {
    category: "Core comparative observational",
    count: 19,
    priority: "1",
    action: "Open full text first",
    decisionRule: "Include_Q1_CoreComparative only if instrument-group sample size and region-specific pain n/total are extractable",
  },
  {
    category: "Instrument-specific observational",
    count: 40,
    priority: "2",
    action: "Check denominators and body-region tables",
    decisionRule: "Use as single-arm prevalence evidence if specific instrument denominator and region-specific outcome are present",
  },
  {
    category: "Manual full-text check",
    count: 23,
    priority: "3",
    action: "Resolve uncertain abstracts",
    decisionRule: "Classify as quantitative synthesis, narrative/support only, or exclude with fixed reason",
  },
  {
    category: "Biomechanical/asymmetry support only",
    count: 76,
    priority: "Support",
    action: "Extract posture/EMG/kinematic evidence",
    decisionRule: "Do not enter quantitative prevalence MA unless pain numerator/denominator is available",
  },
];

export const orchestralPainProject: MetaStudyProject = {
  id: "orchestral-prmd-asymmetry",
  shortTitle: "Orchestral PRMD asymmetry",
  title:
    "Postural Asymmetry and Region-Specific Playing-Related Musculoskeletal Pain in Orchestral Musicians: A Systematic Review, Meta-analysis, and Machine-Learning-Based Pattern Analysis",
  status: "Protocol and PRISMA search design",
  progress: 34,
  sourcePath:
    "E:\\1_Thesis\\Review_Pain Violin\\Thesis\\New Thesis\\270607 새 논문의 핵심 주제.txt",
  researchQuestion:
    "비대칭 연주 자세를 요구하는 악기군은 대칭 또는 중립 자세 악기군보다 특정 부위 및 특정 방향의 통증 유병률이 높은가?",
  novelty:
    "Instrument-imposed postural asymmetry may determine not only the overall burden of playing-related musculoskeletal pain but also its anatomical and laterality-specific distribution.",
  targetJournals: [
    "Scientific Reports",
    "Applied Ergonomics",
    "BMC Musculoskeletal Disorders",
    "Occupational Medicine",
  ],
  immediateImprovement: [
    "기존 violin/viola/upper-string 중심 검색식을 전체 orchestral instrument 검색식으로 확장합니다.",
    "악기를 먼저 분류하지 않고 exposure definition을 먼저 고정해 post hoc grouping 공격을 줄입니다.",
    "Primary는 arm-based region-specific prevalence meta-analysis로 두고, comparative evidence만 secondary network meta-regression에 사용합니다.",
    "AI/ML은 main claim이 아니라 exploratory pattern validation으로 분리합니다.",
    "Region별 outcome을 합치지 않고 neck, shoulder, wrist/hand, back, TMJ/jaw를 따로 분석합니다.",
  ],
  nextActions: [
    "PRISMA protocol lock: PICO/PEO, inclusion/exclusion, exposure criteria, outcome hierarchy를 먼저 고정",
    "PubMed final query count 확인 후 Scopus, Web of Science, Embase, Cochrane 변환 검색식 작성",
    "Instrument biomechanical evidence table 작성: criteria, reference, confidence, mixed-class 처리",
    "Screening form 확정: include, exclude, maybe, exclusion reason, AI priority score",
    "Extraction CSV template 확정 후 pilot extraction 5 papers로 column 누락 확인",
    "R analysis skeleton 생성: arm-based prevalence, laterality, meta-regression, sensitivity, figures",
  ],
  searchBlocks: [
    {
      label: "Musician terms",
      role: "Population",
      query: "musician OR instrumentalist OR orchestra OR performing artist",
    },
    {
      label: "Instrument terms",
      role: "Exposure context",
      query:
        "violin OR viola OR cello OR double bass OR flute OR clarinet OR oboe OR bassoon OR trumpet OR trombone OR horn OR percussion OR piano OR harp",
    },
    {
      label: "Musculoskeletal terms",
      role: "Condition",
      query: "musculoskeletal OR pain OR PRMD OR playing-related OR overuse OR injury OR disorder",
    },
    {
      label: "Anatomical terms",
      role: "Region-specific outcome",
      query:
        "neck OR shoulder OR elbow OR wrist OR hand OR back OR lumbar OR thoracic OR jaw OR temporomandibular",
    },
  ],
  searchRuns: uploadedSearchRuns,
  prismaRows: orchestralPainPrismaRows,
  screeningQueue: orchestralPainScreeningQueue,
  exposureGroups: [
    {
      group: "Group 1: High postural asymmetry",
      instruments: "violin, viola, flute",
      interpretation: "지속적 두경부/견갑대 비대칭 자세와 일측 상지 부하가 큼",
    },
    {
      group: "Group 2: Moderate postural asymmetry / seated axial-load group",
      instruments: "cello, double bass, harp",
      interpretation: "비대칭은 있으나 목-어깨 고정 비대칭은 덜하고 체간/요추 부하가 중요",
    },
    {
      group: "Group 3: Low or mixed asymmetry / comparatively neutral group",
      instruments: "piano, percussion, brass, clarinet/oboe/bassoon as mixed/sensitivity",
      interpretation: "양측 사용 또는 정중 자세가 많음. Brass는 TMJ/orofacial modifier로 별도 표시",
    },
  ],
  exposureFeatures: [
    {
      feature: "Cervical asymmetry",
      definition: "연주 중 지속적 neck rotation 또는 lateral flexion",
    },
    {
      feature: "Shoulder asymmetry",
      definition: "일측 shoulder elevation/abduction 또는 scapular loading",
    },
    {
      feature: "Trunk asymmetry",
      definition: "seated/standing posture에서 지속적 체간 회전 또는 측굴",
    },
    {
      feature: "Unilateral upper-limb dominance",
      definition: "한쪽 상지가 주로 fine motor 또는 load-bearing 역할",
    },
    {
      feature: "EMG asymmetry",
      definition: "좌우 forearm, shoulder, cervical EMG 차이 보고",
    },
    {
      feature: "Orofacial/TMJ load",
      definition: "embouchure, jaw, lip pressure가 주요 부하인 경우. Modifier로 별도 처리",
    },
  ],
  extractionColumns: [
    "study_id",
    "first_author",
    "year",
    "country",
    "design",
    "sample_size_total",
    "sample_size_analyzed",
    "population_source",
    "professional_status",
    "mean_age",
    "female_percent",
    "instrument_group_reported",
    "specific_instrument",
    "mapped_asymmetry_group",
    "mapping_confidence",
    "playing_hours",
    "years_experience",
    "recall_window",
    "pain_definition",
    "prmd_definition",
    "neck_n",
    "neck_total",
    "left_shoulder_n",
    "left_shoulder_total",
    "right_shoulder_n",
    "right_shoulder_total",
    "shoulder_unspecified_n",
    "shoulder_unspecified_total",
    "left_elbow_n",
    "left_elbow_total",
    "right_elbow_n",
    "right_elbow_total",
    "elbow_unspecified_n",
    "elbow_unspecified_total",
    "left_wrist_hand_n",
    "left_wrist_hand_total",
    "right_wrist_hand_n",
    "right_wrist_hand_total",
    "wrist_hand_unspecified_n",
    "wrist_hand_unspecified_total",
    "upper_back_n",
    "upper_back_total",
    "lower_back_n",
    "lower_back_total",
    "tmj_jaw_n",
    "tmj_jaw_total",
    "headache_n",
    "headache_total",
    "pain_intensity_mean",
    "pain_intensity_sd",
    "pain_interference_mean",
    "pain_interference_sd",
    "performance_limitation_n",
    "performance_limitation_total",
    "adjusted_or",
    "adjustment_covariates",
    "notes_on_extractability",
    "source_pdf_available",
    "coder",
    "second_reviewer",
    "conflict_status",
  ],
  extractionSections: [
    {
      section: "Study identity",
      fields: [
        "study_id",
        "first_author",
        "year",
        "country",
        "design",
        "population_source",
        "source_pdf_available",
        "coder",
        "second_reviewer",
        "conflict_status",
      ],
    },
    {
      section: "Design and participants",
      fields: [
        "sample_size_total",
        "sample_size_analyzed",
        "professional_status",
        "mean_age",
        "female_percent",
        "playing_hours",
        "years_experience",
      ],
    },
    {
      section: "Instrument and asymmetry",
      fields: [
        "instrument_group_reported",
        "specific_instrument",
        "mapped_asymmetry_group",
        "mapping_confidence",
      ],
    },
    {
      section: "Pain outcomes",
      fields: [
        "pain_definition",
        "prmd_definition",
        "recall_window",
        "neck_n",
        "neck_total",
        "left_shoulder_n",
        "left_shoulder_total",
        "right_shoulder_n",
        "right_shoulder_total",
        "shoulder_unspecified_n",
        "shoulder_unspecified_total",
        "left_elbow_n",
        "left_elbow_total",
        "right_elbow_n",
        "right_elbow_total",
        "elbow_unspecified_n",
        "elbow_unspecified_total",
        "left_wrist_hand_n",
        "left_wrist_hand_total",
        "right_wrist_hand_n",
        "right_wrist_hand_total",
        "wrist_hand_unspecified_n",
        "wrist_hand_unspecified_total",
        "upper_back_n",
        "upper_back_total",
        "lower_back_n",
        "lower_back_total",
        "tmj_jaw_n",
        "tmj_jaw_total",
      ],
    },
    {
      section: "Intensity, limitation, risk factors",
      fields: [
        "pain_intensity_mean",
        "pain_intensity_sd",
        "pain_interference_mean",
        "pain_interference_sd",
        "performance_limitation_n",
        "performance_limitation_total",
        "adjusted_or",
        "adjustment_covariates",
        "notes_on_extractability",
      ],
    },
  ],
  analysisLayers: [
    {
      layer: "Primary",
      method: "Arm-based random-effects prevalence meta-analysis",
      purpose: "단일군 연구까지 포함해 asymmetry group별 region-specific prevalence 추정",
    },
    {
      layer: "Secondary",
      method: "Contrast-based comparison / Bayesian network meta-regression",
      purpose: "동일 논문 안에서 2개 이상 group을 비교한 경우 prevalence ratio 또는 odds ratio 비교",
    },
    {
      layer: "Exploratory",
      method: "Feature-based clustering, heatmap, UMAP/PCA, co-occurrence network",
      purpose: "사전 분류된 biomechanical groups가 내부적으로 일관적인지 검증",
    },
  ],
  manuscriptOutputs: [
    "Figure 1: PRISMA 2020 flow diagram",
    "Figure 2: Instrument biomechanical classification evidence map",
    "Figure 3: Region-specific prevalence forest plots",
    "Figure 4: Pooled prevalence heatmap by body region and asymmetry group",
    "Figure 5: Left-right laterality dominance plot",
    "Figure 6: Exploratory pain signature clustering or UMAP",
    "Table 1: Study characteristics",
    "Table 2: Prespecified biomechanical classification and references",
    "Table 3: Extraction schema and outcome definitions",
    "Table 4: Meta-regression and sensitivity analysis summary",
  ],
  references: [
    {
      title: "PRISMA 2020 checklist",
      note: "Reporting checklist and flow diagram template for systematic reviews and meta-analyses.",
      url: "https://www.prisma-statement.org/prisma-2020-checklist",
    },
    {
      title: "Cochrane Handbook for Systematic Reviews of Interventions",
      note: "Search, selection, extraction, risk of bias, synthesis, and interpretation methods.",
      url: "https://training.cochrane.org/handbook/current",
    },
    {
      title: "Playing-related musculoskeletal disorders in instrumental musicians",
      note: "Karen Zaza PRMD conceptual foundation.",
      url: pubMedTitleSearch("Playing-related musculoskeletal disorders in instrumental musicians"),
    },
    {
      title: "Musculoskeletal Demands in Violin and Viola Playing: A Literature Review",
      note: "Violin/viola cervical rotation, lateral flexion, shoulder abduction, and asymmetrical loading.",
      url: pubMedTitleSearch("Musculoskeletal Demands in Violin and Viola Playing A Literature Review"),
    },
    {
      title: "Ergonomics in violin and piano playing: a systematic review",
      note: "Core high-asymmetry versus low-asymmetry biomechanical contrast.",
      url: pubMedTitleSearch("Ergonomics in violin and piano playing a systematic review"),
    },
    {
      title: "Assessing posture while playing in musicians: a systematic review",
      note: "Posture assessment and instrument-specific postural load evidence.",
      url: pubMedTitleSearch("Assessing posture while playing in musicians a systematic review"),
    },
    {
      title: "Surface electromyography of forearm and shoulder muscles during violin playing",
      note: "EMG-based unilateral loading evidence for violin performance.",
      url: pubMedTitleSearch("Surface electromyography forearm shoulder muscles during violin playing"),
    },
  ],
};

export const metaStudyProjects: MetaStudyProject[] = [orchestralPainProject];

export function projectFinalPubMedQuery(project: MetaStudyProject) {
  if (project.id === orchestralPainProject.id) return buildSystematicPubMedQuery();
  return project.searchBlocks.map((block) => `(${block.query})`).join(" AND ");
}
