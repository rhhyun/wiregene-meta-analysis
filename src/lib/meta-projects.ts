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
    "instrument_group",
    "specific_instrument",
    "asymmetry_class",
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
