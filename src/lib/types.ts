export type SourceKind = "paper" | "news_us" | "news_kr";

export type Importance = "high" | "medium" | "low";

export type TopicProfile = {
  slug: string;
  name: string;
  description: string;
  terms: string[];
  meshTerms: string[];
  koreanTerms: string[];
  highImpactJournals: string[];
  usNewsTerms: string[];
  krNewsTerms: string[];
};

export type BriefingItem = {
  id?: string;
  topicSlug: string;
  kind: SourceKind;
  sourceId: string;
  title: string;
  sourceName: string;
  publishedAt: string | null;
  url: string;
  doi?: string | null;
  pmid?: string | null;
  authors: string[];
  abstract?: string | null;
  snippet?: string | null;
  summary?: string | null;
  significance?: string | null;
  tags: string[];
  importance: Importance;
  zoteroKey?: string | null;
  raw?: unknown;
};

export type ResearchReport = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  summary: string;
  status: "completed" | "failed";
  model: string | null;
  raw?: unknown;
};

export type ReportWithItems = ResearchReport & {
  items: BriefingItem[];
};

export type GrantEntityType = "school" | "hospital" | "company" | "graduate" | "postdoc";

export type GrantSourceGroup =
  | "central"
  | "regional-regulatory"
  | "investment"
  | "global-research"
  | "trainee-fellowship";

export type GrantSearchSource = {
  name: string;
  url: string;
  role: string;
};

export type GrantDocumentKind = "rfp" | "notice" | "page" | "form" | "unknown";

export type GrantDocumentLink = {
  fileName: string;
  url: string;
  fileSize?: number | null;
  kind: GrantDocumentKind;
  label: string;
};

export type GrantOpportunityRfpPreview = {
  analyzedAt: string;
  fileName: string;
  fileType: string;
  documentUrl?: string | null;
  documentLinks?: GrantDocumentLink[];
  documentKind: GrantDocumentKind;
  documentKindLabel: string;
  fitSummary: string;
  matchedKeywords: string[];
  coreKeywords: string[];
  rfpFocus: string[];
  rfpSections: GrantRfpSection[];
  researchPeriod: GrantRfpFact;
  funding: GrantRfpFact;
  mainResearchObjective: GrantRfpFact;
  goals: string[];
  threeBookFiveProjectRule: GrantRfpFact;
  deadlineSignals: string[];
  documentSignals: string[];
  recommendedActions: string[];
  concerns: string[];
};

export type GrantOpportunity = {
  id: string;
  source: string;
  title: string;
  url: string;
  ministry: string | null;
  agency: string | null;
  noticeNumber: string | null;
  announcedAt: string | null;
  applicationStart: string | null;
  applicationEnd: string | null;
  dDay: number | null;
  status: "open" | "candidate" | "needs_review";
  statusLabel: string;
  solicitationType: string | null;
  topicMatches: string[];
  expandedKeywords: string[];
  relevanceScore: number;
  relevanceReason: string;
  eligibleEntities: GrantEntityType[];
  eligibilityNote: string;
  actionItems: string[];
  excerpt: string | null;
  rfpPreview?: GrantOpportunityRfpPreview | null;
  rfpPreviewError?: string | null;
};

export type GrantSearchResponse = {
  searchedAt: string;
  topics: string[];
  expandedKeywords: string[];
  entitySummary: Record<GrantEntityType, number>;
  sources: GrantSearchSource[];
  opportunities: GrantOpportunity[];
  warnings: string[];
};

export type GrantExcludedOpportunity = {
  id: string;
  sourceGroup: GrantSourceGroup;
  opportunityId: string;
  source: string;
  title: string;
  url: string;
  excludedAt: string;
  reason: string | null;
};

export type GrantKeywordPreset = {
  sourceGroup: GrantSourceGroup;
  baseKeywords: string[];
  updatedAt: string;
};

export type GrantCandidateStatus = "watching" | "preparing" | "submitted" | "archived";

export type GrantPreparationStatus = "todo" | "working" | "ready" | "blocked";

export type GrantPreparationDocument = {
  id: string;
  title: string;
  owner: string;
  dueDate: string | null;
  status: GrantPreparationStatus;
  required: boolean;
  note: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  sourceName?: string | null;
};

export type GrantParticipationUnit = {
  id: string;
  name: string;
  entityType: GrantEntityType;
  participationRole: string;
  responsibilities: string[];
  requiredDocuments: string[];
  riskNotes: string[];
};

export type GrantCandidateProject = {
  id: string;
  sourceGroup: GrantSourceGroup;
  registeredAt: string;
  updatedAt: string;
  status: GrantCandidateStatus;
  priority: "high" | "medium" | "low";
  opportunity: GrantOpportunity;
  proposalDeadline: string | null;
  internalReviewDeadline: string | null;
  preparationDocuments: GrantPreparationDocument[];
  participationUnits: GrantParticipationUnit[];
  nextActions: string[];
  notes: string;
  rfpAnalysis?: GrantRfpUploadAnalysis | null;
  rfpAnalysisError?: string | null;
};

export type GrantRfpFileType = "pdf" | "hwpx" | "text" | "unsupported";

export type GrantRfpSection = {
  label: string;
  excerpt: string;
};

export type GrantRfpEligibilitySignals = Record<GrantEntityType, string[]>;

export type GrantRfpEligibilityDecision = "eligible" | "possible" | "unclear" | "ineligible";

export type GrantRfpFact = {
  value: string;
  evidence: string | null;
};

export type GrantRfpEntityEligibility = {
  decision: GrantRfpEligibilityDecision;
  label: string;
  evidence: string | null;
  action: string;
};

export type GrantRfpDecisionSummary = {
  coreKeywords: string[];
  researchPeriod: GrantRfpFact;
  funding: GrantRfpFact;
  mainResearchObjective: GrantRfpFact;
  goals: string[];
  threeBookFiveProjectRule: GrantRfpFact;
  entityEligibility: Record<GrantEntityType, GrantRfpEntityEligibility>;
};

export type GrantRfpUploadAnalysis = {
  fileName: string;
  fileType: GrantRfpFileType;
  documentUrl: string | null;
  extractedTextLength: number;
  truncated: boolean;
  analyzedAt: string;
  titleGuess: string | null;
  topics: string[];
  extraKeywords: string[];
  fitScore: number;
  fitSummary: string;
  matchedKeywords: string[];
  coreKeywords: string[];
  rfpSections: GrantRfpSection[];
  rfpFocus: string[];
  eligibilitySignals: GrantRfpEligibilitySignals;
  deadlineSignals: string[];
  documentSignals: string[];
  concerns: string[];
  recommendedActions: string[];
  decisionSummary: GrantRfpDecisionSummary;
};
