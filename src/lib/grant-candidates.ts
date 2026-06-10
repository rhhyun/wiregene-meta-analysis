import crypto from "crypto";
import { excludeGrantOpportunity } from "./grant-exclusions";
import { createGrantJsonStorage, grantStorageErrorDetails } from "./grant-storage";
import { analyzeGrantRfpUpload, fetchGrantRfpDocument } from "./rfp-analysis";
import type {
  GrantCandidateProject,
  GrantCandidateStatus,
  GrantDocumentKind,
  GrantDocumentLink,
  GrantEntityType,
  GrantOpportunity,
  GrantParticipationUnit,
  GrantPreparationDocument,
  GrantRfpUploadAnalysis,
  GrantSourceGroup,
} from "./types";

type CandidateData = {
  candidates: GrantCandidateProject[];
};

type SaveCandidateInput = {
  opportunity: GrantOpportunity;
  sourceGroup: GrantSourceGroup;
  notes?: string;
};

const emptyData = (): CandidateData => ({ candidates: [] });
const sourceGroups: GrantSourceGroup[] = [
  "central",
  "regional-regulatory",
  "investment",
  "global-research",
  "trainee-fellowship",
];
const candidateStatuses: GrantCandidateStatus[] = ["watching", "preparing", "submitted", "archived"];
const candidatePriorities = ["high", "medium", "low"] as const;

function cleanText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/g, " ").trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).normalize("NFKC").replace(/\s+/g, " ").trim() || fallback;
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function stringList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/)
      : [];
  return values.map((item) => cleanText(item)).filter(Boolean);
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSourceGroup(value: unknown): GrantSourceGroup {
  return sourceGroups.includes(value as GrantSourceGroup) ? (value as GrantSourceGroup) : "central";
}

function normalizeDocumentKind(value: unknown): GrantDocumentKind {
  return ["rfp", "notice", "page", "form", "unknown"].includes(value as GrantDocumentKind)
    ? (value as GrantDocumentKind)
    : "unknown";
}

function normalizeDocumentLinks(value: unknown): GrantDocumentLink[] {
  if (!Array.isArray(value)) return [];
  const links: GrantDocumentLink[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item as Partial<GrantDocumentLink>;
    const fileName = cleanText(record.fileName);
    const url = cleanText(record.url);
    if (!fileName || !url) return;
    const kind = normalizeDocumentKind(record.kind);
    links.push({
      fileName,
      url,
      fileSize: numberOrNull(record.fileSize),
      kind,
      label: cleanText(record.label, documentKindLabel(kind)),
    });
  });
  return links;
}

function documentKindLabel(kind: GrantDocumentKind) {
  if (kind === "rfp") return "RFP/세부지원내용";
  if (kind === "notice") return "공고문/시행계획";
  if (kind === "form") return "서식/양식";
  if (kind === "page") return "상세페이지";
  return "첨부파일";
}

function normalizeRfpPreview(value: unknown): GrantOpportunity["rfpPreview"] {
  if (!value || typeof value !== "object") return null;
  const item = value as NonNullable<GrantOpportunity["rfpPreview"]>;
  const fileName = cleanText(item.fileName);
  if (!fileName) return null;
  const documentKind = normalizeDocumentKind(item.documentKind);
  return {
    analyzedAt: cleanText(item.analyzedAt, new Date(0).toISOString()),
    fileName,
    fileType: cleanText(item.fileType, "unknown"),
    documentUrl: nullableText(item.documentUrl),
    documentLinks: normalizeDocumentLinks(item.documentLinks),
    documentKind,
    documentKindLabel: cleanText(item.documentKindLabel, documentKindLabel(documentKind)),
    fitSummary: cleanText(item.fitSummary),
    matchedKeywords: stringList(item.matchedKeywords),
    coreKeywords: stringList(item.coreKeywords),
    rfpFocus: stringList(item.rfpFocus),
    rfpSections: Array.isArray(item.rfpSections) ? item.rfpSections : [],
    researchPeriod: item.researchPeriod ?? { value: "확인 필요", evidence: null },
    funding: item.funding ?? { value: "확인 필요", evidence: null },
    mainResearchObjective: item.mainResearchObjective ?? { value: "확인 필요", evidence: null },
    goals: stringList(item.goals),
    threeBookFiveProjectRule: item.threeBookFiveProjectRule ?? { value: "확인 필요", evidence: null },
    deadlineSignals: stringList(item.deadlineSignals),
    documentSignals: stringList(item.documentSignals),
    recommendedActions: stringList(item.recommendedActions),
    concerns: stringList(item.concerns),
  };
}

function sanitizeOpportunity(value: unknown): GrantOpportunity | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<GrantOpportunity>;
  const id = cleanText(item.id);
  const title = cleanText(item.title);
  const url = cleanText(item.url);
  if (!id && !title && !url) return null;

  return {
    id: id || url || title,
    source: cleanText(item.source, "Unknown"),
    title: title || "Untitled opportunity",
    url,
    ministry: nullableText(item.ministry),
    agency: nullableText(item.agency),
    noticeNumber: nullableText(item.noticeNumber),
    announcedAt: nullableText(item.announcedAt),
    applicationStart: nullableText(item.applicationStart),
    applicationEnd: nullableText(item.applicationEnd),
    dDay: numberOrNull(item.dDay),
    status: ["open", "candidate", "needs_review"].includes(item.status ?? "")
      ? (item.status as GrantOpportunity["status"])
      : "candidate",
    statusLabel: cleanText(item.statusLabel, "candidate"),
    solicitationType: nullableText(item.solicitationType),
    topicMatches: stringList(item.topicMatches),
    expandedKeywords: stringList(item.expandedKeywords),
    relevanceScore: numberOrNull(item.relevanceScore) ?? 0,
    relevanceReason: cleanText(item.relevanceReason),
    eligibleEntities: Array.isArray(item.eligibleEntities) ? item.eligibleEntities : ["school", "hospital", "company"],
    eligibilityNote: cleanText(item.eligibilityNote),
    actionItems: stringList(item.actionItems),
    excerpt: nullableText(item.excerpt),
    rfpPreview: normalizeRfpPreview(item.rfpPreview),
    rfpPreviewError: nullableText(item.rfpPreviewError),
  };
}

function sanitizeCandidate(value: unknown): GrantCandidateProject | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<GrantCandidateProject>;
  const opportunity = sanitizeOpportunity(item.opportunity);
  if (!opportunity) return null;
  const sourceGroup = normalizeSourceGroup(item.sourceGroup);
  const nowFallback = new Date(0).toISOString();
  const status = candidateStatuses.includes(item.status as GrantCandidateStatus)
    ? (item.status as GrantCandidateStatus)
    : "preparing";
  const priority = candidatePriorities.includes(item.priority as (typeof candidatePriorities)[number])
    ? (item.priority as GrantCandidateProject["priority"])
    : priorityFor(opportunity);

  return {
    id: cleanText(item.id, stableCandidateId(sourceGroup, opportunity)),
    sourceGroup,
    registeredAt: cleanText(item.registeredAt, nowFallback),
    updatedAt: cleanText(item.updatedAt, nowFallback),
    status,
    priority,
    opportunity,
    proposalDeadline: nullableText(item.proposalDeadline),
    internalReviewDeadline: nullableText(item.internalReviewDeadline),
    preparationDocuments: normalizePreparationDocuments(item.preparationDocuments, opportunity, sourceGroup),
    participationUnits: Array.isArray(item.participationUnits) ? item.participationUnits : [],
    nextActions: stringList(item.nextActions),
    notes: cleanText(item.notes),
    rfpAnalysis: item.rfpAnalysis ?? null,
    rfpAnalysisError: nullableText(item.rfpAnalysisError),
  };
}

function normalizeData(value: unknown): CandidateData {
  const parsed = typeof value === "object" && value !== null ? (value as Partial<CandidateData>) : {};
  return {
    candidates: Array.isArray(parsed.candidates)
      ? parsed.candidates.map(sanitizeCandidate).filter((item): item is GrantCandidateProject => Boolean(item))
      : [],
  };
}

const candidateStorage = createGrantJsonStorage<CandidateData>({
  envName: "GRANT_CANDIDATE_STORAGE_PATH",
  defaultRelativePath: ".data/grant-candidates.json",
  label: "grant candidate",
  emptyData,
  normalize: normalizeData,
});

async function readData(): Promise<CandidateData> {
  return candidateStorage.read();
}

async function writeData(data: CandidateData) {
  await candidateStorage.write(data);
}

function stableCandidateId(sourceGroup: GrantSourceGroup, opportunity: GrantOpportunity) {
  return crypto
    .createHash("sha256")
    .update(`${sourceGroup}:${opportunity.id}:${opportunity.url}:${opportunity.title}`)
    .digest("hex")
    .slice(0, 16);
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function internalReviewDeadline(proposalDeadline: string | null) {
  if (!proposalDeadline) return null;
  return addDays(proposalDeadline, -3);
}

function dueBefore(proposalDeadline: string | null, days: number) {
  if (!proposalDeadline) return null;
  return addDays(proposalDeadline, -days);
}

function document(
  id: string,
  title: string,
  owner: string,
  dueDate: string | null,
  note: string,
  required = true,
  sourceUrl: string | null = null,
  sourceLabel: string | null = null,
  sourceName: string | null = null,
): GrantPreparationDocument {
  return {
    id,
    title,
    owner,
    dueDate,
    status: "todo",
    required,
    note,
    sourceUrl,
    sourceLabel,
    sourceName,
  };
}

function hasActionableDocuments(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some((item) => item && typeof item === "object" && typeof (item as { sourceUrl?: unknown }).sourceUrl === "string")
  );
}

function normalizePreparationDocuments(
  value: unknown,
  opportunity: GrantOpportunity,
  sourceGroup: GrantSourceGroup,
) {
  if (!hasActionableDocuments(value)) return baseDocuments(opportunity, sourceGroup);
  return (value as GrantPreparationDocument[]).map((item) => ({
    ...item,
    sourceUrl: nullableText(item.sourceUrl),
    sourceLabel: nullableText(item.sourceLabel),
    sourceName: nullableText(item.sourceName),
  }));
}

type PreparationDocumentSource = {
  url: string | null;
  label: string | null;
  name: string | null;
};

function selectDocumentSource(
  opportunity: GrantOpportunity,
  preferredKinds: GrantDocumentKind[],
  fallbackLabel: string,
): PreparationDocumentSource {
  const links = opportunity.rfpPreview?.documentLinks ?? [];
  const selected =
    links
      .filter((link) => preferredKinds.includes(link.kind))
      .sort((a, b) => documentLinkRank(b, preferredKinds) - documentLinkRank(a, preferredKinds))[0] ??
    null;

  if (selected) {
    return {
      url: selected.url,
      label: selected.label || fallbackLabel,
      name: selected.fileName,
    };
  }

  const previewUrl = opportunity.rfpPreview?.documentUrl;
  if (previewUrl) {
    return {
      url: previewUrl,
      label: opportunity.rfpPreview?.documentKindLabel || fallbackLabel,
      name: opportunity.rfpPreview?.fileName ?? null,
    };
  }

  return {
    url: opportunity.url || null,
    label: opportunity.url ? fallbackLabel : "링크 없음",
    name: opportunity.url ? "공고 상세페이지" : null,
  };
}

function documentLinkRank(link: GrantDocumentLink, preferredKinds: GrantDocumentKind[]) {
  const kindRank = preferredKinds.length - preferredKinds.indexOf(link.kind);
  const extensionRank = /\.hwpx$/i.test(link.fileName) ? 3 : /\.pdf$/i.test(link.fileName) ? 2 : 1;
  const nameRank =
    /연구개발계획서|사업계획서|제안서/i.test(link.fileName)
      ? 8
      : /양식|서식|첨부서류|제출서류/i.test(link.fileName)
        ? 4
        : /FAQ|매뉴얼|참고자료|사용자/i.test(link.fileName)
          ? -6
          : 0;
  const sizeRank = link.fileSize ? Math.min(link.fileSize / 1_000_000, 3) : 0;
  return kindRank * 10 + nameRank + extensionRank + sizeRank;
}

function baseDocuments(
  opportunity: GrantOpportunity,
  sourceGroup: GrantSourceGroup,
): GrantPreparationDocument[] {
  const proposalDeadline = opportunity.applicationEnd;
  const noticeSource = selectDocumentSource(opportunity, ["notice", "rfp", "page"], "원문/첨부 열기");
  const rfpSource = selectDocumentSource(opportunity, ["rfp", "notice", "page"], "RFP/공고문 열기");
  const formSource = selectDocumentSource(opportunity, ["form", "rfp", "notice", "page"], "양식/서식 확인");

  if (sourceGroup === "trainee-fellowship") {
    return [
      document(
        "trainee-notice",
        "모집공고·지원요강",
        "지원자",
        dueBefore(proposalDeadline, 7),
        "공고 페이지에서 지원자격, 제출 시스템, 양식을 확인합니다.",
        true,
        noticeSource.url,
        noticeSource.label,
        noticeSource.name,
      ),
      document(
        "trainee-forms",
        "개인 연구계획서·추천서 양식",
        "지원자·지도교수",
        dueBefore(proposalDeadline, 5),
        "공고 첨부의 개인 지원서, 추천서, 증명서 양식을 내려받습니다.",
        true,
        formSource.url,
        formSource.label,
        formSource.name,
      ),
    ];
  }

  if (sourceGroup === "global-research") {
    return [
      document(
        "global-call",
        "Call/RFP 원문",
        "연구책임자",
        dueBefore(proposalDeadline, 10),
        "공식 call 페이지에서 LOI/Full proposal 단계와 제출 링크를 확인합니다.",
        true,
        noticeSource.url,
        noticeSource.label,
        noticeSource.name,
      ),
      document(
        "global-forms",
        "Proposal·Budget·Biosketch 양식",
        "전체 참여기관",
        dueBefore(proposalDeadline, 7),
        "공식 포털의 proposal package, budget template, biosketch 양식을 확인합니다.",
        true,
        formSource.url,
        formSource.label,
        formSource.name,
      ),
    ];
  }

  const docs = [
    document(
      "notice-rfp",
      "공고문·RFP·세부 지원내용",
      "연구책임자",
      dueBefore(proposalDeadline, 10),
      "공고 상세 페이지에서 RFP, 세부 지원내용, 품목개요 첨부를 확인합니다.",
      true,
      rfpSource.url,
      rfpSource.label,
      rfpSource.name,
    ),
    document(
      "proposal",
      "연구개발계획서·제안서 양식",
      "주관기관",
      dueBefore(proposalDeadline, 5),
      "공고 첨부에서 계획서/제안서 양식을 내려받아 작성합니다.",
      true,
      formSource.url,
      formSource.label,
      formSource.name,
    ),
    document(
      "submission-forms",
      "제출서류 서식",
      "주관기관",
      dueBefore(proposalDeadline, 5),
      "신청서, 확약서, 개인정보 동의서, 참여의사 확인서 등 첨부 서식을 확인합니다.",
      true,
      formSource.url,
      formSource.label,
      formSource.name,
    ),
  ];

  if (opportunity.eligibleEntities.includes("hospital")) {
    docs.push(
      document(
        "clinical-template",
        "임상·IRB 관련 양식",
        "아주대병원",
        dueBefore(proposalDeadline, 4),
        "임상시험계획, IRB, 개인정보/데이터 관련 서식이 있는지 확인합니다.",
        false,
        formSource.url,
        formSource.label,
        formSource.name,
      ),
    );
  }

  if (opportunity.eligibleEntities.includes("company") || sourceGroup === "investment") {
    docs.push(
      document(
        "company-forms",
        "기업 증빙·사업화 서식",
        "와이어젠",
        dueBefore(proposalDeadline, 4),
        "사업자등록증, 재무/고용 확인, 기업부담금, 사업화 계획 서식을 확인합니다.",
        false,
        formSource.url,
        formSource.label,
        formSource.name,
      ),
    );
  }

  return docs;
}

function unit(
  id: string,
  name: string,
  entityType: GrantEntityType,
  participationRole: string,
  responsibilities: string[],
  requiredDocuments: string[],
  riskNotes: string[],
): GrantParticipationUnit {
  return {
    id,
    name,
    entityType,
    participationRole,
    responsibilities,
    requiredDocuments,
    riskNotes,
  };
}

function participationUnits(sourceGroup: GrantSourceGroup): GrantParticipationUnit[] {
  const isGlobal = sourceGroup === "global-research";
  const isInvestment = sourceGroup === "investment";

  if (sourceGroup === "trainee-fellowship") {
    return [
      unit(
        "graduate-trainee",
        "석박통합·박사과정생",
        "graduate",
        "개인 지원자 또는 예비 지원자",
        [
          "학위논문과 연결되는 독립 연구질문 정리",
          "전업 재학, 수료, 학기, 국적, 중복수혜 제한 확인",
          "지도교수와 1년/2년 연구계획 및 산출물 합의",
        ],
        ["재학/수료증명서", "성적증명서", "개인 연구계획서", "지도교수 확인서", "연구실적 목록"],
        [
          "석박통합 과정은 공고별로 석사 트랙과 박사 트랙 중 어느 자격인지 확인",
          "연구비 중앙관리와 소속 대학 산학협력단 승인 절차 확인",
        ],
      ),
      unit(
        "postdoc-trainee",
        "포닥·박사후연구원",
        "postdoc",
        "개인 지원자 또는 host lab 연수자",
        [
          "박사학위 취득일, 임용/고용 형태, 전임/비전임 여부 확인",
          "독립 연구계획, 경력개발 계획, host PI mentoring plan 작성",
          "국내연수/국외연수/글로벌 펠로십의 이동성 조건 확인",
        ],
        ["박사학위증명서", "CV/Biosketch", "논문목록", "Host PI letter", "연수계획서"],
        [
          "박사학위 취득 후 경과기간 제한과 예외 인정 여부 확인",
          "현재 고용계약, 인건비 중복, 소속기관 변경 가능성 확인",
        ],
      ),
      unit(
        "ajou-mentor",
        "아주대학교·아주대병원 멘토",
        "school",
        "지도교수·Host PI·임상 멘토",
        [
          "지원자의 연구주제와 연구환경 적합성 확인",
          "추천서, host confirmation, 연구윤리·IRB 필요성 검토",
          "연구실/병원 데이터, 장비, 환자군 접근 가능성 정리",
        ],
        ["지도교수 확인서", "Host PI letter", "연구환경 확인서", "IRB/데이터 활용 메모"],
        [
          "학생·포닥 개인과제라도 기관 승인과 연구비 중앙관리가 필요할 수 있음",
          "임상자료 활용 시 병원 내부 승인과 개인정보 조건을 선확인",
        ],
      ),
    ];
  }

  return [
    unit(
      "ajou-university",
      "아주대학교",
      "school",
      isInvestment ? "기술자문·공동연구 후보" : "주관 또는 공동연구기관 후보",
      [
        "연구책임자와 핵심 가설 정리",
        "선행연구, 논문 근거, 실험/분석 방법 설계",
        "예산 총괄과 산학협력단 제출 일정 관리",
      ],
      ["연구개발계획서", "연구책임자 CV", "산학협력단 제출 서류", "예산서"],
      [
        "주관기관 자격과 PI 소속 제한 확인 필요",
        isGlobal ? "해외 funder의 indirect cost와 international applicant 허용 여부 확인" : "내부 제출 마감이 실제 공고 마감보다 빠를 수 있음",
      ],
    ),
    unit(
      "ajou-hospital",
      "아주대병원",
      "hospital",
      "임상·환자군·데이터 검증 기관 후보",
      [
        "환자군, 임상 endpoint, 평가척도 정의",
        "IRB, 개인정보, 의무기록/영상/재활 데이터 활용 가능성 검토",
        "임상 적용성과 병원 workflow 적합성 정리",
      ],
      ["IRB 필요성 검토", "임상연구계획 요약", "환자군/데이터 가용성 메모", "병원 참여확약서"],
      [
        "환자 대상 연구는 IRB와 개인정보 반출 기준을 먼저 확인",
        "의료기기/소프트웨어는 사용적합성, 인허가, 임상시험 해당 여부 확인",
      ],
    ),
    unit(
      "wiregen",
      "와이어젠",
      "company",
      isInvestment ? "주관 또는 투자유치 기업 후보" : "공동·위탁·사업화 파트너 후보",
      [
        "제품/소프트웨어/디바이스 구현 가능성 검토",
        "IP, 사업화, 인허가, 시장진입 계획 작성",
        "기업부담금, 투자유치, 고용/매출 요건 확인",
      ],
      ["사업자등록증", "재무/고용 확인 자료", "기업 소개서", "사업화·IP 계획", "투자 또는 기업부담금 확인 자료"],
      [
        isGlobal ? "해외 연구재단은 회사 주관을 제한할 수 있어 공동연구·supply·translation partner 구조 확인" : "기업 주관/공동/위탁 가능 여부와 현금·현물 부담 조건 확인",
        "IP 소유권, 데이터 사용권, 결과물 사업화 권리를 사전에 정리",
      ],
    ),
  ];
}

function initialNextActions(opportunity: GrantOpportunity, sourceGroup: GrantSourceGroup) {
  const actions = [
    "원문 공고를 열어 접수상태, 마감 시각, 제출 시스템을 확정",
    "아주대학교·아주대병원·와이어젠 중 주관기관 후보를 1차 결정",
    "연구책임자, 임상책임자, 기업 PM을 지정하고 30분 킥오프 진행",
  ];

  if (sourceGroup === "global-research") {
    actions.unshift("LOI/Executive Summary 제출 단계가 있는지 먼저 확인");
  }
  if (sourceGroup === "trainee-fellowship") {
    actions.unshift("석박통합/박사과정/포닥 중 정확한 지원 트랙과 개인 자격부터 확인");
  }
  if (opportunity.dDay !== null && opportunity.dDay <= 7) {
    actions.unshift("마감 임박: 내부 산학협력단 제출 가능 여부부터 즉시 확인");
  }

  return actions;
}

function priorityFor(opportunity: GrantOpportunity) {
  if (opportunity.status === "open" && (opportunity.relevanceScore >= 0.35 || (opportunity.dDay ?? 999) <= 21)) {
    return "high" as const;
  }
  if (opportunity.relevanceScore >= 0.25) return "medium" as const;
  return "low" as const;
}

function buildCandidate(input: SaveCandidateInput, existing?: GrantCandidateProject): GrantCandidateProject {
  const now = new Date().toISOString();
  const proposalDeadline = input.opportunity.applicationEnd;
  return {
    id: existing?.id ?? stableCandidateId(input.sourceGroup, input.opportunity),
    sourceGroup: input.sourceGroup,
    registeredAt: existing?.registeredAt ?? now,
    updatedAt: now,
    status: existing?.status ?? ("preparing" satisfies GrantCandidateStatus),
    priority: existing?.priority ?? priorityFor(input.opportunity),
    opportunity: input.opportunity,
    proposalDeadline,
    internalReviewDeadline: internalReviewDeadline(proposalDeadline),
    preparationDocuments: existing?.preparationDocuments ?? baseDocuments(input.opportunity, input.sourceGroup),
    participationUnits: existing?.participationUnits ?? participationUnits(input.sourceGroup),
    nextActions: existing?.nextActions ?? initialNextActions(input.opportunity, input.sourceGroup),
    notes: input.notes ?? existing?.notes ?? "",
    rfpAnalysis: existing?.rfpAnalysis ?? null,
    rfpAnalysisError: existing?.rfpAnalysisError ?? null,
  };
}

async function analyzeOpportunityRfp(opportunity: GrantOpportunity): Promise<GrantRfpUploadAnalysis> {
  const downloaded = await fetchGrantRfpDocument(opportunity.url);
  return analyzeGrantRfpUpload({
    ...downloaded,
    documentUrl: downloaded.documentUrl ?? opportunity.url,
    topics: [
      opportunity.title,
      ...opportunity.topicMatches,
      ...(opportunity.solicitationType ? [opportunity.solicitationType] : []),
    ],
    extraKeywords: [
      ...opportunity.expandedKeywords,
      "연구기간",
      "연구비",
      "지원규모",
      "최종목표",
      "성과목표",
      "3책5공",
      "주관연구개발기관",
      "공동연구개발기관",
      "신청자격",
    ],
  });
}

async function attachRfpAnalysis(candidate: GrantCandidateProject) {
  try {
    const rfpAnalysis = await analyzeOpportunityRfp(candidate.opportunity);
    return {
      ...candidate,
      rfpAnalysis,
      rfpAnalysisError: null,
      updatedAt: new Date().toISOString(),
    } satisfies GrantCandidateProject;
  } catch (error) {
    return {
      ...candidate,
      rfpAnalysis: candidate.rfpAnalysis ?? null,
      rfpAnalysisError:
        error instanceof Error
          ? error.message
          : "RFP 자동 분석에 실패했습니다. 공고문/RFP 파일을 직접 업로드해 분석해 주세요.",
      updatedAt: new Date().toISOString(),
    } satisfies GrantCandidateProject;
  }
}

export async function listGrantCandidates() {
  const data = await readData();
  return [...data.candidates].sort((a, b) => {
    const aDeadline = a.proposalDeadline ?? "9999-12-31";
    const bDeadline = b.proposalDeadline ?? "9999-12-31";
    if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function saveGrantCandidate(input: SaveCandidateInput) {
  const data = await readData();
  const id = stableCandidateId(input.sourceGroup, input.opportunity);
  const existing = data.candidates.find((candidate) => candidate.id === id);
  const candidate = buildCandidate(input, existing);

  data.candidates = [candidate, ...data.candidates.filter((item) => item.id !== id)];
  await writeData(data);
  return candidate;
}

export async function analyzeGrantCandidateRfp(candidateId: string) {
  const data = await readData();
  const candidate = data.candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;

  const updated = await attachRfpAnalysis(candidate);
  data.candidates = data.candidates.map((item) => (item.id === candidateId ? updated : item));
  await writeData(data);
  return updated;
}

export async function removeGrantCandidate(candidateId: string, exclude = false) {
  const data = await readData();
  const candidate = data.candidates.find((item) => item.id === candidateId);
  if (!candidate) return null;

  let exclusionError: string | null = null;
  let exclusionDetails: ReturnType<typeof grantStorageErrorDetails> | null = null;
  if (exclude) {
    try {
      await excludeGrantOpportunity({
        sourceGroup: candidate.sourceGroup,
        opportunity: candidate.opportunity,
        reason: "removed-from-candidate-board",
      });
    } catch (error) {
      exclusionDetails = grantStorageErrorDetails(error);
      exclusionError = error instanceof Error ? error.message : "배제 목록 저장에 실패했습니다.";
    }
  }

  data.candidates = data.candidates.filter((item) => item.id !== candidateId);
  await writeData(data);
  return { candidate, exclusionError, exclusionDetails };
}
