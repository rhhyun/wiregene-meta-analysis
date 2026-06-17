"use client";

import {
  ArrowUpRight,
  Archive,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderOpen,
  KeyRound,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Target,
  Trash2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MetaAnalysisPanel } from "@/components/MetaAnalysisPanel";
import { MetaAiSettingsPanel } from "@/components/MetaAiSettingsPanel";
import { MetaExtractionDatasetPanel } from "@/components/MetaExtractionDatasetPanel";
import { MetaFullTextAssistant } from "@/components/MetaFullTextAssistant";
import type { CurrentWiregeneUser } from "@/lib/auth-session";
import { summarizeImportedRecords, type ImportedRecord } from "@/lib/meta-analysis-records";
import { buildPubMedSearchUrl, buildSystematicPubMedQuery } from "@/lib/meta-analysis-pubmed";
import {
  metaStudyProjects,
  metaStudyStages,
  projectFinalPubMedQuery,
  type MetaStudyProject,
  type MetaSearchRun,
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
const newTopicDraftStorageKey = "wiregene-meta-new-topic-draft-v1";
const userMetaProjectsStorageKey = "wiregene-meta-user-study-projects-v1";
const protocolDraftStorageKey = "wiregene-meta-protocol-draft-v1";
const searchImportStorageKey = "wiregene-meta-search-import-log-v1";
const searchQueryOverrideStorageKey = "wiregene-meta-search-query-overrides-v1";
const searchDatabaseSelectionStorageKey = "wiregene-meta-search-database-selection-v1";

const canonicalSearchDatabases = ["PubMed", "Embase", "Scopus", "Web of Science", "Cochrane"] as const;
type CanonicalSearchDatabase = (typeof canonicalSearchDatabases)[number];
const defaultSelectedSearchDatabases: CanonicalSearchDatabase[] = ["PubMed"];

type NewTopicDraft = {
  title: string;
  researchQuestion: string;
  population: string;
  exposure: string;
  outcomes: string;
  databases: string;
  eligibility: string;
  searchBlocks: string;
  extractionPlan: string;
};

type NewTopicAnalysisPayload = {
  ok?: boolean;
  model?: string | null;
  draft?: Partial<NewTopicDraft>;
  needsUserReview?: string[];
  note?: string;
  error?: string;
};

type ProjectStorageFileSummary = {
  fileName: string;
  path: string;
  bytes: number;
  updatedAt: string;
  webViewLink?: string;
};

type ProjectStorageSummary = {
  projectId: string;
  folderName: string;
  storageBackend: "local-json" | "google-drive";
  storageRoot: string;
  projectPath: string;
  synologyPathHint: string | null;
  exists: boolean;
  files: ProjectStorageFileSummary[];
};

type ProjectFileSaveResponse = {
  savedFile: ProjectStorageFileSummary & {
    projectId: string;
    folderName: string;
    storageRoot: string;
    projectPath: string;
    synologyPathHint: string | null;
    storageBackend: "local-json" | "google-drive";
  };
  storage: ProjectStorageSummary;
};

type ProjectWorkspaceState = {
  updatedAt?: string;
  protocolDraft?: unknown;
  searchImportRows?: unknown;
  queryOverrides?: unknown;
  selectedDatabases?: unknown;
  workbookBoard?: unknown;
};

type ProjectWorkspaceStateResponse = {
  ok?: boolean;
  state?: ProjectWorkspaceState;
  storage?: ProjectStorageSummary;
  error?: string;
};

type UserMetaProjectsResponse = {
  ok?: boolean;
  projects?: MetaStudyProject[];
  storage?: {
    backend: "local-json" | "google-drive";
    path: string;
  };
  error?: string;
};

const projectFileSavedEventName = "wiregene-meta-project-file-saved";

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

const genericScreeningRules = [
  ["AI priority ranking", "AI는 우선순위 정렬과 메모 작성만 보조하며 최종 포함/제외 판정은 reviewer가 확정합니다."],
  ["Two independent reviewers", "include, exclude, maybe를 독립 판정하고 conflict는 PI 또는 senior reviewer가 해결합니다."],
  ["Reason-coded exclusion", "population, exposure/intervention, comparator, outcome, design, duplicate, unavailable full text 등 protocol-defined 사유로만 제외합니다."],
  ["Full-text audit trail", "full text 단계의 제외 사유와 근거 위치를 기록해 Methods와 supplement에 연결합니다."],
];

const genericFullTextExclusionReasons = [
  "wrong population",
  "wrong exposure/intervention",
  "wrong comparator or no eligible group",
  "wrong outcome",
  "wrong study design",
  "no extractable denominator or effect size",
  "duplicate record",
  "review/book chapter/editorial",
  "conference abstract only",
  "non-English full text",
];

const genericAnalysisSafeguards = [
  ["Primary claim", "사전에 고정한 primary outcome과 synthesis method를 벗어나 결론을 확장하지 않습니다."],
  ["Quantitative eligibility", "추출 가능한 denominator/effect size와 불확실성 지표가 있는 결과만 정량 합성에 포함합니다."],
  ["Subgroup separation", "subgroup, sensitivity, exploratory analysis는 primary synthesis와 분리해 해석합니다."],
  ["AI/ML position", "AI/ML 또는 clustering은 data exploration 보조로만 두고 main causal/clinical claim으로 사용하지 않습니다."],
];

const genericAnalysisReadinessRows = [
  ["Primary outcome", "event_n/total 또는 effect_size/standard_error", "Pending until extraction"],
  ["Secondary outcome", "protocol-defined secondary outcome fields", "Pending until extraction"],
  ["Subgroup analysis", "subgroup variable plus sufficient studies per subgroup", "Not ready until extraction count confirms"],
  ["Sensitivity analysis", "risk-of-bias, study design, recall/follow-up, missing-data flags", "Template review required"],
  ["Publication bias", "effect size and standard error with adequate study count", "Not ready until synthesis count confirms"],
];

const genericMethodSentences = [
  "Eligible studies contributed to quantitative synthesis only when the protocol-defined outcome and extractable denominator or effect-size information were available.",
  "Primary synthesis followed the prespecified effect measure and random-effects model, with subgroup and sensitivity analyses reported separately.",
  "Exploratory AI-assisted pattern review was used only to support screening, extraction consistency, or hypothesis generation and did not replace reviewer judgement.",
];

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredRecord<T>(key: string): Record<string, T> {
  const value = readStoredJson<unknown>(key, {});
  return isPlainRecord(value) ? (value as Record<string, T>) : {};
}

function recordFromUnknown<T>(value: unknown): Record<string, T> {
  return isPlainRecord(value) ? (value as Record<string, T>) : {};
}

function stringRecordFromUnknown(value: unknown): Record<string, string> {
  if (!isPlainRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function normalizeTitle(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return repairKnownFullTitle(normalized || fallback);
}

function repairKnownFullTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (/evidence-informed prediction of preventable post-traumatic disability/i.test(normalized)) {
    return "Evidence-informed prediction of preventable post-traumatic disability";
  }
  return normalized;
}

function menuLabelFromTitle(value: string) {
  const normalized = normalizeTitle(value, "Untitled meta-analysis topic").replace(/\s*\.\.\.$/, "");
  if (/post[-\s]?traumatic disability|preventable post[-\s]?traumatic/i.test(normalized)) {
    return "Post-traumatic disability";
  }
  if (/musician|instrumentalist|orchestra|prmd|playing-related/i.test(normalized)) {
    return "Musician PRMD pain";
  }

  const boilerplate =
    /\b(systematic|review|meta-analysis|metaanalysis|protocol|study|studies|evidence-informed|prediction|preventable|among|for|of|and|the|a|an|in|on|with|using|based)\b/i;
  const words = normalized
    .split(/\s+/)
    .map((word) => word.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter((word) => word && !boilerplate.test(word))
    .slice(0, 5);
  return words.length > 0 ? words.join(" ") : normalized.split(/\s+/).slice(0, 5).join(" ");
}

function projectFullTitle(project: Pick<MetaStudyProject, "title" | "shortTitle">) {
  return normalizeTitle(project.title || project.shortTitle, "Untitled meta-analysis topic");
}

function projectMenuLabel(project: Pick<MetaStudyProject, "title" | "shortTitle">) {
  const fullTitle = projectFullTitle(project);
  const storedShortTitle = normalizeTitle(project.shortTitle || "", "");
  if (storedShortTitle && !storedShortTitle.includes("...") && storedShortTitle !== fullTitle) {
    return menuLabelFromTitle(storedShortTitle);
  }
  return menuLabelFromTitle(fullTitle);
}

function projectVisibility(project: Pick<MetaStudyProject, "visibility">) {
  return project.visibility === "archived" || project.visibility === "deleted" ? project.visibility : "active";
}

function isVisibleProject(project: MetaStudyProject) {
  return projectVisibility(project) === "active";
}

function isArchivedProject(project: MetaStudyProject) {
  return projectVisibility(project) === "archived";
}

function projectTopicKey(project: Pick<MetaStudyProject, "id" | "title" | "shortTitle">) {
  const fullTitle = projectFullTitle(project)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\W_]+/g, " ")
    .trim();
  if (!fullTitle || fullTitle === "untitled meta analysis topic") return `id:${project.id}`;
  return `title:${fullTitle}`;
}

function sameProjectTopic(left: MetaStudyProject, right: MetaStudyProject) {
  return left.id === right.id || projectTopicKey(left) === projectTopicKey(right);
}

function projectListSignature(projects: MetaStudyProject[]) {
  return JSON.stringify(
    projects.map((project) => ({
      id: project.id,
      title: projectFullTitle(project),
      visibility: projectVisibility(project),
      archivedAt: project.archivedAt ?? "",
      deletedAt: project.deletedAt ?? "",
      updatedAt: project.updatedAt ?? "",
    })),
  );
}

function firstVisibleProjectId(projects: MetaStudyProject[]) {
  return projects.find(isVisibleProject)?.id ?? "new-topic";
}

function canonicalDatabaseName(value: string): CanonicalSearchDatabase | null {
  const normalized = value.toLowerCase().replace(/[()[\]{}]/g, " ");
  if (/\b(pubmed|puvmed|medline)\b/.test(normalized)) return "PubMed";
  if (/\bembase\b/.test(normalized)) return "Embase";
  if (/\bscopus\b/.test(normalized)) return "Scopus";
  if (/\b(web\s*of\s*science|wos)\b/.test(normalized)) return "Web of Science";
  if (/\b(cochrane|central)\b/.test(normalized)) return "Cochrane";
  return null;
}

function normalizeDatabaseDisplayName(value: string, fallback: CanonicalSearchDatabase = "PubMed") {
  return canonicalDatabaseName(value) ?? fallback;
}

function dedupeDatabases(databases: string[]) {
  const selected: CanonicalSearchDatabase[] = [];
  for (const database of databases) {
    const canonicalDatabase = canonicalDatabaseName(database);
    if (canonicalDatabase && !selected.includes(canonicalDatabase)) selected.push(canonicalDatabase);
  }
  return selected;
}

function normalizeDatabaseSelection(value: unknown, fallback: CanonicalSearchDatabase[] = defaultSelectedSearchDatabases) {
  const selected = Array.isArray(value) ? dedupeDatabases(value.filter((item): item is string => typeof item === "string")) : [];
  return selected.length > 0 ? selected : [...fallback];
}

function sanitizeSearchRun(run: MetaSearchRun, searchedAt = new Date().toISOString().slice(0, 10)): MetaSearchRun {
  const database = normalizeDatabaseDisplayName(run.database);
  return {
    database,
    searchedAt: run.searchedAt || searchedAt,
    label: run.label || "Search draft",
    query: run.query || "",
    resultCount: Number.isFinite(run.resultCount) ? run.resultCount : 0,
    limits: run.limits || "Confirm database syntax, date, language, and filters.",
    source: run.source || "User-saved topic",
    exportAction: run.exportAction || "Run search and export RIS/NBIB/CSV.",
  };
}

function sanitizeSearchRuns(searchRuns: MetaSearchRun[]) {
  const searchedAt = new Date().toISOString().slice(0, 10);
  const byDatabase = new Map<CanonicalSearchDatabase, MetaSearchRun>();
  for (const run of searchRuns) {
    const database = canonicalDatabaseName(run.database);
    if (!database || byDatabase.has(database)) continue;
    byDatabase.set(database, sanitizeSearchRun({ ...run, database }, searchedAt));
  }
  return canonicalSearchDatabases.flatMap((database) => {
    const run = byDatabase.get(database);
    return run ? [run] : [];
  });
}

function selectedSearchDatabasesForProject(project: MetaStudyProject) {
  const meaningfulRuns = (Array.isArray(project.searchRuns) ? project.searchRuns : []).filter(
    (run) => run.resultCount > 0 || Boolean(run.query?.trim()),
  );
  const selected = dedupeDatabases(meaningfulRuns.map((run) => run.database));
  if (selected.length > 0) return selected;
  return isOrchestralPainProject(project) ? [...canonicalSearchDatabases] : [...defaultSelectedSearchDatabases];
}

function searchRunDraftForDatabase(project: MetaStudyProject, database: CanonicalSearchDatabase): MetaSearchRun {
  return {
    database,
    searchedAt: new Date().toISOString().slice(0, 10),
    label: "Researcher-selected search draft",
    query: projectSearchQueryForDatabase(project, database),
    resultCount: 0,
    limits: "Confirm database syntax, date, language, and filters.",
    source: "Generated after database selection",
    exportAction: "Run exact search, export RIS/CSV/NBIB, and update external result count.",
  };
}

function searchRunsForDatabases(project: MetaStudyProject, selectedDatabases: CanonicalSearchDatabase[]) {
  const byDatabase = new Map<CanonicalSearchDatabase, MetaSearchRun>();
  for (const run of sanitizeSearchRuns(Array.isArray(project.searchRuns) ? project.searchRuns : [])) {
    const database = canonicalDatabaseName(run.database);
    if (database) byDatabase.set(database, run);
  }
  return selectedDatabases.map((database) => byDatabase.get(database) ?? searchRunDraftForDatabase(project, database));
}

function sanitizeMetaStudyProject(project: MetaStudyProject | null | undefined): MetaStudyProject | null {
  if (!project?.id) return null;
  const fallback = metaStudyProjects[0];
  const searchBlocks = Array.isArray(project.searchBlocks) ? project.searchBlocks : [];
  const searchRuns = Array.isArray(project.searchRuns) ? project.searchRuns : [];
  const prismaRows = Array.isArray(project.prismaRows) ? project.prismaRows : [];
  const workbookSheets = Array.isArray(project.workbookSheets) ? project.workbookSheets : [];
  const analysisLayers = Array.isArray(project.analysisLayers) ? project.analysisLayers : [];
  const title = normalizeTitle(project.title || project.shortTitle, fallback.title);

  return {
    ...fallback,
    ...project,
    shortTitle: projectMenuLabel({ title, shortTitle: project.shortTitle || "" }),
    title,
    visibility: projectVisibility(project),
    status: project.status || "Protocol and PRISMA search design",
    progress: Number.isFinite(project.progress) ? project.progress : 0,
    sourcePath: project.sourcePath || "User-saved meta-analysis topic",
    researchQuestion: project.researchQuestion || "Research question needs PI confirmation.",
    novelty: project.novelty || "Confirm novelty before protocol lock.",
    targetJournals: Array.isArray(project.targetJournals) ? project.targetJournals : [],
    immediateImprovement: Array.isArray(project.immediateImprovement) ? project.immediateImprovement : [],
    nextActions: Array.isArray(project.nextActions) ? project.nextActions : [],
    searchBlocks:
      searchBlocks.length > 0
        ? searchBlocks
        : [{ label: "Search query needed", role: "Draft search", query: project.researchQuestion || "" }],
    searchRuns: sanitizeSearchRuns(searchRuns),
    prismaRows,
    screeningQueue: Array.isArray(project.screeningQueue) ? project.screeningQueue : [],
    workbookSheets,
    exposureGroups: Array.isArray(project.exposureGroups) ? project.exposureGroups : [],
    exposureFeatures: Array.isArray(project.exposureFeatures) ? project.exposureFeatures : [],
    extractionColumns: Array.isArray(project.extractionColumns) ? project.extractionColumns : [],
    extractionSections: Array.isArray(project.extractionSections) ? project.extractionSections : [],
    analysisLayers,
    manuscriptOutputs: Array.isArray(project.manuscriptOutputs) ? project.manuscriptOutputs : [],
    references: Array.isArray(project.references) ? project.references : [],
  };
}

function mergeMetaStudyProjects(primary: MetaStudyProject[], secondary: MetaStudyProject[]) {
  const seen = new Set<string>();
  const topicIndex = new Map<string, number>();
  const merged: MetaStudyProject[] = [];
  for (const project of [...primary, ...secondary]) {
    const sanitizedProject = sanitizeMetaStudyProject(project);
    if (!sanitizedProject || seen.has(sanitizedProject.id)) continue;
    const topicKey = projectTopicKey(sanitizedProject);
    const existingIndex = topicIndex.get(topicKey);
    if (existingIndex !== undefined) {
      const existingProject = merged[existingIndex];
      if (projectVisibility(sanitizedProject) !== "active" && projectVisibility(existingProject) === "active") {
        merged[existingIndex] = {
          ...sanitizedProject,
          duplicateOf: existingProject.id,
        };
        seen.add(sanitizedProject.id);
      }
      continue;
    }
    seen.add(sanitizedProject.id);
    topicIndex.set(topicKey, merged.length);
    merged.push(sanitizedProject);
  }
  return merged.slice(0, 30);
}

function compactTitle(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 78 ? `${normalized.slice(0, 75)}...` : normalized;
}

function slugPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "meta-topic"
  );
}

function splitDraftList(value: string, fallback: string[] = []) {
  const items = value
    .split(/[\n;,]+/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseDatabaseDraft(value: string) {
  const byDatabase = new Map<CanonicalSearchDatabase, number>();
  for (const item of splitDraftList(value, defaultSelectedSearchDatabases)) {
    const countMatch = item.match(/\b(\d{1,7})\b/);
    const databaseText =
      item
        .replace(/\b\d{1,7}\b/g, "")
        .replace(/\b(results?|records?|hits?)\b/gi, "")
        .replace(/[()=:.-]+$/g, "")
        .trim() || item.trim();
    const database = canonicalDatabaseName(databaseText);
    if (!database) continue;
    const resultCount = countMatch ? Number(countMatch[1]) : 0;
    byDatabase.set(database, Number.isFinite(resultCount) ? resultCount : 0);
  }
  if (byDatabase.size === 0) byDatabase.set("PubMed", 0);
  return canonicalSearchDatabases.flatMap((database) =>
    byDatabase.has(database) ? [{ database, resultCount: byDatabase.get(database) ?? 0 }] : [],
  );
}

function createNewTopicProject(draft: NewTopicDraft, sourceText: string, reviewItems: string[]): MetaStudyProject {
  const now = new Date();
  const searchedAt = now.toISOString().slice(0, 10);
  const title = normalizeTitle(draft.title, "Untitled meta-analysis topic");
  const databases = parseDatabaseDraft(draft.databases);
  const totalRecords = databases.reduce((total, item) => total + item.resultCount, 0);
  const searchQuery =
    draft.searchBlocks.trim() ||
    [draft.population, draft.exposure, draft.outcomes]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(" AND ") ||
    "(Population terms) AND (Exposure terms) AND (Outcome terms)";
  const extractionColumns = [
    "study_id",
    "first_author",
    "year",
    "country",
    "design",
    "sample_size_total",
    "population",
    "exposure_group",
    "comparator",
    "outcome_name",
    "event_n",
    "outcome_total",
    "effect_size",
    "standard_error",
    "risk_of_bias_overall",
    "notes",
  ];

  return {
    id: `user-${now.getTime()}-${slugPart(title)}`,
    shortTitle: menuLabelFromTitle(title),
    title,
    status: "AI parsed draft - PI review required",
    progress: 12,
    sourcePath: `New topic AI analysis; saved ${now.toISOString()}`,
    researchQuestion: draft.researchQuestion || "Research question needs PI confirmation.",
    novelty: "AI가 구상내용을 초기 연구계획으로 parsing했습니다. Protocol lock 전에 연구자가 모든 필드를 확인해야 합니다.",
    targetJournals: ["TBD after protocol lock"],
    immediateImprovement: reviewItems.length > 0 ? reviewItems : ["AI 분석 결과를 protocol, search, extraction 항목별로 확인합니다."],
    nextActions: [
      "Protocol 탭에서 PICO/PEO, eligibility, exclusion, synthesis plan을 확정",
      "Search 탭에서 DB별 검색식과 실제 result count를 확인",
      "Extraction 탭에서 CSV header와 outcome denominator를 연구 주제에 맞게 수정",
      "Screening 탭에서 two-reviewer rule과 exclusion reason set을 고정",
    ],
    searchBlocks: [
      { label: "AI parsed search block", role: "Draft search", query: searchQuery },
    ],
    searchRuns: databases.map((item) => ({
      database: item.database,
      searchedAt,
      label: "AI parsed search draft",
      query: draftSearchQueryForDatabase(
        {
          id: "draft",
          searchBlocks: [{ label: "AI parsed search block", role: "Draft search", query: searchQuery }],
        } as MetaStudyProject,
        item.database,
        searchQuery,
      ),
      resultCount: item.resultCount,
      limits: "Confirm database syntax, year/language limits, and exact run date before protocol lock.",
      source: "New topic AI analysis input",
      exportAction: "Run exact search, export RIS/CSV/NBIB, and update external result count.",
    })),
    prismaRows: [
      {
        step: "Records identified from databases",
        count: totalRecords > 0 ? totalRecords : null,
        status: totalRecords > 0 ? "working" : "pending",
        note: totalRecords > 0 ? "Sum of AI-parsed database counts; verify against actual DB exports." : "Enter DB result counts after running searches.",
      },
      {
        step: "Records after deduplication",
        count: null,
        status: "pending",
        note: "Run deduplication after RIS/CSV/NBIB export.",
      },
      {
        step: "Title/abstract screening completed",
        count: null,
        status: "pending",
        note: "Complete two-reviewer screening after deduplication.",
      },
      {
        step: "Full-text assessment queue",
        count: null,
        status: "pending",
        note: "Populate after title/abstract screening.",
      },
    ],
    screeningQueue: [
      {
        category: "Title/abstract screening",
        count: totalRecords,
        priority: "Start",
        action: "Deduplicate first, then classify include/exclude/maybe by two reviewers.",
        decisionRule: "AI priority may assist sorting only; final inclusion requires reviewer decision.",
      },
      {
        category: "Full-text eligibility",
        count: 0,
        priority: "After screening",
        action: "Upload full texts and record fixed exclusion reasons.",
        decisionRule: "Exclude only with protocol-defined reason and supporting note.",
      },
    ],
    workbookSheets: [
      {
        sheetName: "Full_Text_Extraction_Draft",
        label: "AI parsed full-text extraction queue",
        count: 0,
        source: "New topic AI analysis",
        uploadRequired: true,
        priority: "Pilot",
        reviewMode: "cautious",
        action: "Add full-text files after screening and pilot extraction.",
        decisionRule: "Quantitative synthesis requires extractable n/total or effect size fields.",
      },
      {
        sheetName: "Decision_Rules",
        label: "Protocol decision rules",
        count: 1,
        source: "New topic AI analysis",
        uploadRequired: false,
        priority: "Rules",
        reviewMode: "not_required",
        action: "Use for eligibility, extraction, and analysis consistency.",
        decisionRule: "Lock before full screening.",
      },
    ],
    exposureGroups: [
      {
        group: "AI parsed exposure",
        instruments: draft.exposure || "Exposure/group definition needs confirmation.",
        interpretation: "Use this as a draft only; lock the final exposure definition in the Protocol tab.",
      },
    ],
    exposureFeatures: splitDraftList(draft.exposure, ["Exposure definition needs PI confirmation."]).map((feature) => ({
      feature: compactTitle(feature, "Exposure feature"),
      definition: "AI parsed draft; confirm operational definition before screening.",
    })),
    extractionColumns,
    extractionSections: [
      { section: "Study identity", fields: extractionColumns.slice(0, 6) },
      { section: "Population and exposure", fields: extractionColumns.slice(6, 9) },
      { section: "Outcome data", fields: extractionColumns.slice(9, 14) },
      { section: "Bias and notes", fields: extractionColumns.slice(14) },
    ],
    analysisLayers: [
      {
        layer: "Primary synthesis",
        method: "Random-effects meta-analysis if extractable quantitative data are available",
        purpose: draft.extractionPlan || "Confirm effect size, denominator, and heterogeneity plan before analysis.",
      },
      {
        layer: "Sensitivity / narrative layer",
        method: "Narrative synthesis or subgroup/sensitivity analysis as data allow",
        purpose: "Use when studies are too heterogeneous or counts are not extractable.",
      },
    ],
    manuscriptOutputs: [
      "PRISMA flow diagram after search and deduplication",
      "Protocol-ready eligibility and search supplement",
      "Study characteristics and extraction schema table",
      "Primary synthesis figure/table after data lock",
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
    ],
  };
}

function initialProtocolDraft(project: MetaStudyProject) {
  if (project.id === "orchestral-prmd-asymmetry") {
    return {
      population: "orchestral musicians, instrumentalists, music students/professionals",
      exposure: "instrument-imposed postural asymmetry",
      comparator: "low or mixed asymmetry instruments",
      outcomes: "region-specific and laterality-specific pain prevalence",
      eligibility:
        "Observational full-text studies with extractable instrument-specific or group-specific PRMD/pain data.",
      exclusion:
        "Wrong population, no region-specific pain outcome, no instrument-specific data, no extractable denominator, review/editorial/conference abstract, intervention-only treatment effect study.",
      synthesis:
        "Arm-based random-effects prevalence meta-analysis; comparative layer only when studies report two or more prespecified asymmetry groups; exploratory ML as pattern validation.",
    };
  }

  const searchBlocks = Array.isArray(project.searchBlocks) ? project.searchBlocks : [];
  const exposureGroups = Array.isArray(project.exposureGroups) ? project.exposureGroups : [];
  const immediateImprovement = Array.isArray(project.immediateImprovement) ? project.immediateImprovement : [];
  const analysisLayers = Array.isArray(project.analysisLayers) ? project.analysisLayers : [];
  return {
    population: searchBlocks.find((block) => block.role.toLowerCase().includes("population"))?.query || project.researchQuestion,
    exposure: exposureGroups.map((group) => `${group.group}: ${group.instruments}`).join("\n") || "Exposure needs confirmation.",
    comparator: "Comparator or subgroup contrast needs PI confirmation.",
    outcomes: searchBlocks.find((block) => block.role.toLowerCase().includes("outcome"))?.query || "Primary and secondary outcomes need confirmation.",
    eligibility: immediateImprovement.join("\n") || "Inclusion criteria need confirmation.",
    exclusion: "Define exclusion reasons before screening.",
    synthesis: analysisLayers.map((layer) => `${layer.layer}: ${layer.method}. ${layer.purpose}`).join("\n"),
  };
}

type ProtocolDraft = ReturnType<typeof initialProtocolDraft>;

const protocolSectionPatterns: Array<{ field: keyof ProtocolDraft; pattern: string }> = [
  { field: "population", pattern: "populations?|participants?|patients?|study population|pico\\s+population" },
  { field: "exposure", pattern: "exposures?|interventions?|predictors?|risk factors?|index test|peo\\s+exposure|pico\\s+intervention" },
  { field: "comparator", pattern: "comparators?|comparisons?|controls?|subgroups?|reference group" },
  { field: "outcomes", pattern: "outcomes?|endpoints?|primary outcomes?|secondary outcomes?|outcome hierarchy" },
  { field: "eligibility", pattern: "eligibility|inclusion(?: criteria)?|included studies|study criteria" },
  { field: "exclusion", pattern: "exclusion(?: criteria| rule| reasons?)?|excluded studies" },
  { field: "synthesis", pattern: "synthesis(?: plan)?|analysis(?: plan)?|statistical analysis|meta-analysis|modeling plan" },
];

function cleanProtocolSection(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function protocolSentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function findProtocolSectionMatches(text: string) {
  const matches: Array<{ field: keyof ProtocolDraft; index: number; contentStart: number }> = [];

  for (const section of protocolSectionPatterns) {
    const regex = new RegExp(
      `(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:${section.pattern})\\s*(?:\\([^\\n)]*\\))?\\s*[:：\\-]\\s*`,
      "gi",
    );
    for (const match of text.matchAll(regex)) {
      matches.push({
        field: section.field,
        index: match.index ?? 0,
        contentStart: (match.index ?? 0) + match[0].length,
      });
    }
  }

  return matches.sort((left, right) => left.index - right.index);
}

function parseProtocolDraftText(text: string, current: ProtocolDraft): ProtocolDraft {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const parsed: Partial<ProtocolDraft> = {};
  const matches = findProtocolSectionMatches(normalized);

  matches.forEach((match, index) => {
    if (parsed[match.field]) return;
    const next = matches[index + 1];
    const raw = normalized.slice(match.contentStart, next?.index ?? normalized.length);
    const cleaned = cleanProtocolSection(raw);
    if (cleaned) parsed[match.field] = cleaned;
  });

  const sentences = protocolSentences(normalized);
  const fillFromSentence = (field: keyof ProtocolDraft, patterns: RegExp[]) => {
    if (parsed[field]) return;
    const selected = sentences.filter((sentence) => patterns.some((pattern) => pattern.test(sentence))).slice(0, 3);
    if (selected.length > 0) parsed[field] = selected.join(" ");
  };

  fillFromSentence("population", [/\bamong\b/i, /\bpatients?\b/i, /\bparticipants?\b/i, /\bcohort\b/i]);
  fillFromSentence("exposure", [/\bpredictors?\b/i, /\bexposures?\b/i, /\binterventions?\b/i, /\brisk factors?\b/i]);
  fillFromSentence("comparator", [/\bcomparators?\b/i, /\bcontrols?\b/i, /\bsubgroups?\b/i, /\bcontrast\b/i]);
  fillFromSentence("outcomes", [/\boutcomes?\b/i, /\bendpoints?\b/i, /\bprimary\b/i, /\bsecondary\b/i]);
  fillFromSentence("eligibility", [/\beligib/i, /\binclusion\b/i, /\bincluded\b/i]);
  fillFromSentence("exclusion", [/\bexclusion\b/i, /\bexcluded\b/i, /\bexclude\b/i]);
  fillFromSentence("synthesis", [/\bsynthesis\b/i, /\bmeta-analysis\b/i, /\brandom-effects\b/i, /\bmodel\b/i, /\bvalidation\b/i]);

  return { ...current, ...parsed };
}

function isOrchestralPainProject(project: Pick<MetaStudyProject, "id">) {
  return project.id === "orchestral-prmd-asymmetry";
}

function overviewStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "현재 연구 진행상황을 high-impact 구조로 재정렬합니다",
      detail: "첨부하신 핵심 주제 파일을 기준으로, protocol-first, exposure-first, region-specific, exploratory AI 분석 구조로 정리했습니다.",
    };
  }

  return {
    title: "이 주제의 연구계획과 다음 작업을 분리해 정리합니다",
    detail: "새로 생성한 주제는 기존 연구의 분류, 검색식, 추출 변수와 섞지 않고 이 주제 전용 protocol, search, screening, extraction, analysis 상태만 사용합니다.",
  };
}

function protocolStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "악기 분류보다 exposure definition을 먼저 고정합니다",
      detail: "이 단계에서 분류 기준을 잠그면, 결과를 본 뒤 group을 바꿨다는 post hoc grouping 공격을 피할 수 있습니다.",
      featureHeading: "Biomechanical criteria",
    };
  }

  return {
    title: "연구 질문과 eligibility criteria를 먼저 고정합니다",
    detail: "이 단계에서는 기존 연구의 문구를 가져오지 않고, 이 주제의 population, exposure/intervention, comparator, outcomes, inclusion/exclusion 기준만 확정합니다.",
    featureHeading: "Exposure / intervention criteria",
  };
}

function searchStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "업로드 자료 기반 DB별 검색식과 PRISMA 식별 수",
      detail: "PDF에는 정확한 검색식이 없고, 2026-06-07 스크린샷에만 DB별 검색식과 결과 수가 있습니다. 이 표를 protocol supplement와 PRISMA identification source로 고정합니다.",
      logTitle: "Search log from uploaded screenshots",
      logDetail: "각 행은 검색일, DB, 정확 검색식, 결과 수, 제한 조건, export 작업을 보존합니다.",
      prismaNote: "1,393건은 1,652 - 259 계산값입니다. dedup log 확인 전까지 순수 duplicates라고 단정하지 않습니다.",
      flags: [
        "PubMed/Cochrane screenshot에는 명시적 1990-2026 제한이 보이지 않아 supplement에서 확인 필요.",
        "Cochrane 식은 다른 DB보다 좁고 orchestra/performing artist/다수 악기명이 누락되어 sensitivity flag로 표시.",
        "Embase/WoS의 horn은 Scopus/PubMed의 french horn보다 넓어 noise 가능성 있음.",
        "English limit는 PubMed/Embase만 스크린샷에 명확하며 WoS/Scopus/Cochrane은 run log 확인 필요.",
      ],
    };
  }

  return {
    title: "이 주제의 DB별 검색식과 PRISMA 식별 수를 확정합니다",
    detail: "AI가 만든 초안 검색식은 검토 대상입니다. 실제 DB별 검색일, 검색식, 제한 조건, 결과 수, export 파일명을 이 주제 전용 search log로 저장합니다.",
    logTitle: "Search log for this topic",
    logDetail: "각 행은 이 주제의 database, 검색일, 검색식, 결과 수, 제한 조건, export 작업만 보존합니다.",
    prismaNote: "검색 실행 전에는 모든 수치를 pending으로 둡니다. 실제 DB export와 deduplication log를 확인한 뒤 PRISMA count를 확정합니다.",
    flags: [
      "AI가 변환한 검색식은 DB 문법별로 직접 검토합니다.",
      "연도, 언어, human/full-text 등 제한 조건은 protocol에 고정한 뒤 실행합니다.",
      "검색 결과 수는 실제 DB 화면 또는 export log 기준으로만 확정합니다.",
      "기존 연구의 검색식, 결과 수, exclusion note를 새 주제에 복사하지 않습니다.",
    ],
  };
}

function screeningStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: (activeUploadCount: number) => `Excel 표준 workbook 기준으로 ${activeUploadCount}개 full-text PDF/Word 파일만 처리합니다`,
      detail: "Summary/Search 숫자는 이전 PDF 값을 기준으로 유지하고, 실제 업로드 대상은 Core_Comparative_Obs 18개, Core_InstrumentSpecific 36개, Manual_FullText_Check 18개입니다.",
      queueDetail: "이 표는 업로드가 필요한 3개 sheet만 active queue로 취급합니다. 나머지 Excel sheet는 audit/support/exclusion 용도입니다.",
    };
  }

  return {
    title: (activeUploadCount: number) => `이 주제의 full-text 후보 ${activeUploadCount}개를 별도 queue로 관리합니다`,
    detail: "새 주제의 screening queue는 기존 연구의 Excel sheet나 exclusion 기준을 가져오지 않습니다. protocol에서 확정한 기준으로만 include/exclude/maybe를 기록합니다.",
    queueDetail: "이 표는 이 주제에 속한 screening/full-text 후보만 표시합니다. 기존 연구의 sheet count와 decision rule은 섞지 않습니다.",
  };
}

function workbookStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "업로드 대상은 3개 sheet, 나머지는 audit/support로 고정",
      rule: "Summary의 초기 검색/PRISMA 숫자는 이전 PDF 값을 기준으로 유지합니다. 실제 full-text PDF/Word 확인 중 탈락이 생기면 아래 current/included/excluded 값을 직접 수정하고 CSV로 남깁니다.",
    };
  }

  return {
    title: "이 주제 전용 workbook queue를 사용합니다",
    rule: "새 주제의 full-text 파일과 추출 행만 이 board에 입력합니다. 다른 연구의 Summary, sheet count, include/exclude 결과는 사용하지 않습니다.",
  };
}

function extractionStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "PDF의 6개 extraction 블록을 실제 CSV 템플릿과 검증기로 고정합니다",
      detail: "숫자가 있으면 원 논문 table, figure, supplement에서 denominator와 numerator를 그대로 입력하고, n/total이 없으면 quantitative synthesis에 넣지 않습니다.",
      placeholder: `${project.extractionColumns.slice(0, 8).join(",")},...\nS001,Smith,2024,Korea,cross-sectional,120,118,orchestra sample,...`,
    };
  }

  return {
    title: "이 주제의 extraction schema와 CSV 검증 기준을 확정합니다",
    detail: "정량 합성에 필요한 denominator, effect size, uncertainty, risk-of-bias 필드를 먼저 고정합니다. 기존 연구의 변수명은 이 주제에 필요한 경우에만 수동으로 채택합니다.",
    placeholder: `${project.extractionColumns.slice(0, 8).join(",")},...\nS001,Smith,2024,Korea,cross-sectional,120,eligible sample,...`,
  };
}

function analysisStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "Primary는 prevalence MA, secondary는 network meta-regression입니다",
      detail: "전통적 치료 NMA처럼 보이면 위험하므로 observational exposure comparison임을 Methods에서 분명히 합니다.",
    };
  }

  return {
    title: "이 주제의 primary synthesis와 sensitivity analysis를 분리합니다",
    detail: "Protocol에서 확정한 outcome과 effect measure를 기준으로 분석합니다. 기존 연구의 분석 구조나 결과 해석을 새 주제에 자동 적용하지 않습니다.",
  };
}

function manuscriptStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      title: "Figure와 Methods 문장을 먼저 고정하면 원고 작성 속도가 빨라집니다",
      detail: "high-impact journal은 novelty보다도 method reproducibility와 limitation 방어를 강하게 봅니다.",
    };
  }

  return {
    title: "이 주제 전용 Methods와 output list를 작성합니다",
    detail: "Manuscript output은 이 주제의 protocol, search log, extraction schema, analysis plan에서만 생성합니다.",
  };
}

function referencesStageCopy(project: MetaStudyProject) {
  if (isOrchestralPainProject(project)) {
    return {
      detail: "PRISMA, Cochrane, PRMD 고전 논문, violin/viola biomechanics, posture review를 protocol 근거로 연결합니다.",
    };
  }

  return {
    detail: "PRISMA, Cochrane Handbook, 그리고 이 주제에 직접 관련된 핵심 근거만 연결합니다. 기존 연구의 reference는 자동으로 섞지 않습니다.",
  };
}

function screeningRulesForProject(project: MetaStudyProject) {
  return isOrchestralPainProject(project) ? screeningRules : genericScreeningRules;
}

function fullTextExclusionReasonsForProject(project: MetaStudyProject) {
  return isOrchestralPainProject(project) ? fullTextExclusionReasons : genericFullTextExclusionReasons;
}

function analysisSafeguardsForProject(project: MetaStudyProject) {
  return isOrchestralPainProject(project) ? analysisSafeguards : genericAnalysisSafeguards;
}

function analysisReadinessRowsForProject(project: MetaStudyProject) {
  return isOrchestralPainProject(project) ? analysisReadinessRows : genericAnalysisReadinessRows;
}

function methodSentencesForProject(project: MetaStudyProject) {
  return isOrchestralPainProject(project) ? methodSentences : genericMethodSentences;
}

function projectSearchQueryForDatabase(project: MetaStudyProject, database: string, runQuery = "") {
  const databaseName = normalizeDatabaseDisplayName(database);
  if (isOrchestralPainProject(project)) return orchestralExecutableSearchQuery(databaseName);
  const searchBlocks = Array.isArray(project.searchBlocks) ? project.searchBlocks : [];
  const labeledQuery = findDatabaseLabeledQuery(
    [runQuery, ...searchBlocks.map((block) => block.query)].filter(Boolean),
    databaseName,
  );
  if (labeledQuery) return normalizeDatabaseSpecificQuery(databaseName, labeledQuery);

  const cleanedRunQuery = cleanSearchQueryText(runQuery);
  if (
    isPubMedDatabase(databaseName) &&
    looksExecutableSearchQuery(cleanedRunQuery) &&
    !hasOtherDatabaseLabel(cleanedRunQuery, databaseName)
  ) {
    return normalizeDatabaseSpecificQuery(databaseName, cleanedRunQuery);
  }
  const base = searchBlocks
    .map((block) => cleanSearchQueryText(block.query))
    .filter(Boolean)
    .map((query) => `(${query})`)
    .join(" AND ");
  return isPubMedDatabase(databaseName) ? normalizeDatabaseSpecificQuery(databaseName, base) : "";
}

function draftSearchQueryForDatabase(project: MetaStudyProject, database: string, runQuery = "") {
  const databaseName = normalizeDatabaseDisplayName(database);
  const existingQuery = projectSearchQueryForDatabase(project, databaseName, runQuery);
  if (existingQuery) return existingQuery;

  const searchBlocks = Array.isArray(project.searchBlocks) ? project.searchBlocks : [];
  const genericBase =
    cleanSearchQueryText(runQuery) ||
    searchBlocks
      .map((block) => cleanSearchQueryText(block.query))
      .filter(Boolean)
      .map((query) => `(${query})`)
      .join(" AND ") ||
    projectFinalPubMedQuery(project);
  return adaptGenericSearchQueryForDatabase(databaseName, genericBase);
}

function normalizeDatabaseSpecificQuery(database: string, base: string) {
  const normalized = normalizeDatabaseDisplayName(database).toLowerCase();
  const cleaned = removeSupplementarySearchBlocks(base);
  if (!cleaned.trim()) return "";
  if (normalized.includes("scopus")) {
    if (/TITLE-ABS-KEY\s*\(/i.test(cleaned)) return cleaned;
    return "";
  }
  if (normalized.includes("web of science")) {
    if (/\bTS\s*=/i.test(cleaned)) return cleaned;
    return "";
  }
  if (normalized.includes("embase")) {
    if (/:ti,ab|\[english\]\/lim|\/exp/i.test(cleaned)) return cleaned;
    return "";
  }
  if (normalized.includes("cochrane")) return cleaned;
  return cleaned;
}

function adaptGenericSearchQueryForDatabase(database: CanonicalSearchDatabase, query: string) {
  const cleaned = stripSearchFieldTags(query);
  if (!looksExecutableSearchQuery(cleaned)) return "";
  if (database === "PubMed") return normalizeDatabaseSpecificQuery(database, cleaned);
  if (database === "Embase") return normalizeDatabaseSpecificQuery(database, `(${cleaned}):ti,ab AND [english]/lim`);
  if (database === "Scopus") return normalizeDatabaseSpecificQuery(database, `TITLE-ABS-KEY(${cleaned})`);
  if (database === "Web of Science") return normalizeDatabaseSpecificQuery(database, `TS=(${cleaned})`);
  if (database === "Cochrane") return normalizeDatabaseSpecificQuery(database, cleaned);
  return "";
}

function stripSearchFieldTags(value: string) {
  return cleanSearchQueryText(value)
    .replace(/\[(?:title\/abstract|tiab|mesh terms?|mesh|all fields)\]/gi, "")
    .replace(/\bTITLE-ABS-KEY\s*\(/gi, "(")
    .replace(/\bTS\s*=\s*/gi, "")
    .replace(/:ti,ab\b/gi, "")
    .replace(/\[(?:english|humans?)\]\/lim/gi, "")
    .replace(/\[\d{4}-\d{4}\]\/py/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSearchQueryText(value: string) {
  return removeSupplementarySearchBlocks(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(
          /^\s*(?:(?:pubmed|medline|scopus|web of science|wos|embase|cochrane|central)\s+)?(?:core search concept|search concept|search block|ai parsed search block|draft search|search|query|strategy|population|exposure|intervention|outcome|condition|database query)\s*[:：-]\s*/i,
          "",
        )
        .trim(),
    )
    .filter((line) => line && !/^use this|^copy this|^notes?:/i.test(line))
    .join("\n")
    .trim();
}

function looksExecutableSearchQuery(value: string) {
  if (!value.trim()) return false;
  if (/core search concept|search concept|write a query|copy this|draft search\s*[:：-]/i.test(value)) return false;
  return /\b(AND|OR|NOT)\b|["()[\]*]/i.test(value);
}

function removeSupplementarySearchBlocks(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n(?=\s*(?:optional|supplementary|ai-specific|sensitivity)\b)/i)[0]
    .replace(/\s*Optional\s+(?:AI-specific\s+)?supplementary\s+block\s*:[\s\S]*$/i, "")
    .trim();
}

function isPubMedDatabase(database: string) {
  return normalizeDatabaseDisplayName(database) === "PubMed";
}

function databaseAliases(database: string) {
  const normalized = normalizeDatabaseDisplayName(database);
  if (normalized === "PubMed") return ["pubmed", "puvmed", "medline"];
  if (normalized === "Embase") return ["embase"];
  if (normalized === "Scopus") return ["scopus"];
  if (normalized === "Web of Science") return ["web of science", "wos"];
  if (normalized === "Cochrane") return ["cochrane", "central"];
  return [];
}

function isDatabaseHeading(line: string) {
  return /^\s*(?:pubmed|medline|scopus|web of science|wos|embase|cochrane|central)\b.*(?:search|query|strategy|draft)?\s*[:：-]/i.test(line);
}

function hasOtherDatabaseLabel(value: string, database: string) {
  const aliases = databaseAliases(database);
  return value
    .split("\n")
    .some((line) => isDatabaseHeading(line) && !aliases.some((alias) => new RegExp(`^\\s*${escapeRegExp(alias)}\\b`, "i").test(line)));
}

function findDatabaseLabeledQuery(values: string[], database: string) {
  const aliases = databaseAliases(database);
  for (const value of values) {
    const lines = value.replace(/\r\n/g, "\n").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isTargetHeading =
        isDatabaseHeading(line) &&
        aliases.some((alias) => new RegExp(`^\\s*${escapeRegExp(alias)}\\b`, "i").test(line));
      if (!isTargetHeading) continue;

      const [, inline = ""] = line.split(/[:：-]\s*/, 2);
      const collected = [inline];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const nextLine = lines[cursor];
        if (isDatabaseHeading(nextLine) || /^\s*(?:export|notes?|recommended|count|results?)\b/i.test(nextLine)) break;
        collected.push(nextLine);
      }

      const cleaned = cleanSearchQueryText(collected.join("\n"));
      if (cleaned) return cleaned;
    }
  }
  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function orchestralExecutableSearchQuery(database: string) {
  const normalized = database.toLowerCase();
  if (normalized.includes("pubmed")) return buildSystematicPubMedQuery();
  if (normalized.includes("scopus")) {
    return [
      'TITLE-ABS-KEY(musician* OR instrumentalist* OR orchestra* OR "performing artist")',
      'TITLE-ABS-KEY(violin* OR viola* OR cello* OR "double bass" OR contrabass OR flute* OR guitar* OR mandolin* OR clarinet* OR oboe* OR bassoon* OR trumpet* OR trombone* OR "french horn" OR percussion* OR piano* OR harp*)',
      'TITLE-ABS-KEY(pain OR musculoskeletal OR PRMD OR "playing-related" OR "playing-related musculoskeletal disorder*" OR "performance-related musculoskeletal disorder*" OR overuse OR injury OR disorder* OR "repetitive strain" OR "overuse syndrome")',
      "PUBYEAR > 1989",
      'LIMIT-TO(LANGUAGE, "English")',
    ].join(" AND ");
  }
  if (normalized.includes("web of science")) {
    return [
      'TS=(musician* OR instrumentalist* OR orchestra* OR "performing artist")',
      'TS=(violin* OR viola* OR cello* OR "double bass" OR contrabass OR flute* OR guitar* OR mandolin* OR clarinet* OR oboe* OR bassoon* OR trumpet* OR trombone* OR "french horn" OR horn OR percussion* OR piano* OR harp*)',
      'TS=(pain OR musculoskeletal OR PRMD OR "playing-related" OR "playing-related musculoskeletal disorder*" OR "performance-related musculoskeletal disorder*" OR overuse OR injury OR disorder* OR "repetitive strain" OR "overuse syndrome")',
      "PY=(1990-2026)",
    ].join(" AND ");
  }
  if (normalized.includes("embase")) {
    return [
      "('musician'/exp OR musician*:ti,ab OR instrumentalist*:ti,ab OR orchestra*:ti,ab OR 'performing artist':ti,ab)",
      "('violin'/exp OR violin*:ti,ab OR viola*:ti,ab OR cello*:ti,ab OR 'double bass':ti,ab OR contrabass:ti,ab OR flute*:ti,ab OR guitar*:ti,ab OR mandolin*:ti,ab OR clarinet*:ti,ab OR oboe*:ti,ab OR bassoon*:ti,ab OR trumpet*:ti,ab OR trombone*:ti,ab OR 'french horn':ti,ab OR horn:ti,ab OR percussion*:ti,ab OR piano*:ti,ab OR harp*:ti,ab)",
      "('musculoskeletal pain'/exp OR 'musculoskeletal disease'/exp OR pain:ti,ab OR musculoskeletal:ti,ab OR prmd:ti,ab OR 'playing-related':ti,ab OR 'playing-related musculoskeletal disorder*':ti,ab OR 'performance-related musculoskeletal disorder*':ti,ab OR overuse:ti,ab OR injury:ti,ab OR disorder*:ti,ab OR 'repetitive strain':ti,ab OR 'overuse syndrome':ti,ab)",
      "[english]/lim",
      "[1990-2026]/py",
    ].join(" AND ");
  }
  if (normalized.includes("cochrane")) {
    return [
      '#1 musician* OR instrumentalist* OR orchestra* OR "performing artist"',
      '#2 violin* OR viola* OR cello* OR "double bass" OR contrabass OR flute* OR guitar* OR mandolin* OR clarinet* OR oboe* OR bassoon* OR trumpet* OR trombone* OR "french horn" OR horn OR percussion* OR piano* OR harp*',
      '#3 pain OR musculoskeletal OR PRMD OR "playing-related" OR "playing-related musculoskeletal disorder*" OR "performance-related musculoskeletal disorder*" OR overuse OR injury OR disorder* OR "repetitive strain" OR "overuse syndrome"',
      "#4 #1 AND #2 AND #3",
    ].join("\n");
  }
  return buildSystematicPubMedQuery();
}

function databaseSearchUrl(database: string, query: string, pubMedUrl?: string) {
  if (!query.trim()) return "";
  const normalized = normalizeDatabaseDisplayName(database);
  if (normalized === "PubMed") return buildPubMedSearchUrl(query) || pubMedUrl || "";
  if (normalized === "Cochrane") {
    return `https://www.cochranelibrary.com/advanced-search?searchBy=6&searchText=${encodeURIComponent(query)}`;
  }
  if (normalized === "Embase") return "https://www.embase.com/search/advanced";
  if (normalized === "Scopus") return "https://www.scopus.com/search/form.uri?display=advanced";
  if (normalized === "Web of Science") return "https://www.webofscience.com/wos/woscc/advanced-search";
  return "";
}

const searchExportGuidance = [
  ["PubMed", "NBIB or RIS", "Keep PMID, DOI, title, abstract, publication type, year."],
  ["Embase", "RIS preferred; CSV acceptable", "Keep Embase ID, DOI, PMID if present, Emtree terms, document type."],
  ["Scopus", "RIS preferred; CSV acceptable", "Keep EID, DOI, title, abstract, source title, year, document type."],
  ["Web of Science", "RIS/EndNote or tab-delimited full record", "Keep accession number, DOI, title, abstract, document type."],
  ["Cochrane", "RIS", "Keep CENTRAL/review source tag and record type."],
];

type SearchUploadFileSummary = {
  fileName: string;
  database: string;
  rawCount: number;
  uniqueCount: number;
  duplicateCount: number;
};

type SearchUploadSummary = {
  files: SearchUploadFileSummary[];
  rawCount: number;
  uniqueCount: number;
  duplicateCount: number;
  mechanicallyExcluded: Array<ImportedRecord & { exclusionReason: string }>;
  screeningReady: ImportedRecord[];
};

function inferDatabaseFromFileName(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("pubmed") || normalized.includes("nbib")) return "PubMed";
  if (normalized.includes("scopus")) return "Scopus";
  if (normalized.includes("wos") || normalized.includes("web-of-science") || normalized.includes("webofscience")) return "Web of Science";
  if (normalized.includes("embase")) return "Embase";
  if (normalized.includes("cochrane") || normalized.includes("central")) return "Cochrane";
  return "Unknown";
}

function mechanicalExclusionReason(record: ImportedRecord) {
  const text = `${record.title}\n${record.raw}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(review|systematic review|meta-analysis|scoping review|narrative review)\b/, "review/meta-analysis"],
    [/\b(letter|editorial|comment|commentary|reply)\b/, "letter/editorial/comment"],
    [/\b(conference abstract|meeting abstract|conference paper|abstract only)\b/, "conference abstract"],
    [/\b(book chapter|chapter)\b/, "book chapter"],
    [/\b(case report)\b/, "case report"],
    [/\b(protocol)\b/, "protocol"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

function searchUploadMasterCsv(summary: SearchUploadSummary | null) {
  if (!summary) return "";
  return csvRows([
    ["status", "exclusion_reason", "dedup_key", "title", "raw_record"],
    ...summary.screeningReady.map((record) => [
      "screening_ready",
      "",
      record.key,
      record.title,
      record.raw,
    ]),
    ...summary.mechanicallyExcluded.map((record) => [
      "mechanically_excluded",
      record.exclusionReason,
      record.key,
      record.title,
      record.raw,
    ]),
  ]);
}

export function MetaStudyWorkspace({
  initialSearchQuery,
  currentUser,
}: {
  initialSearchQuery?: string;
  currentUser?: CurrentWiregeneUser | null;
}) {
  const [userProjects, setUserProjects] = useState<MetaStudyProject[]>(() => {
    const storedProjects = readStoredJson<MetaStudyProject[]>(userMetaProjectsStorageKey, []);
    return Array.isArray(storedProjects) ? mergeMetaStudyProjects(storedProjects, []) : [];
  });
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    firstVisibleProjectId(mergeMetaStudyProjects(userProjects, metaStudyProjects)),
  );
  const [stage, setStage] = useState<MetaStudyStage>("overview");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [projectMenuCollapsed, setProjectMenuCollapsed] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [projectSyncNotice, setProjectSyncNotice] = useState("");
  const [projectSyncError, setProjectSyncError] = useState("");
  const allProjects = useMemo(() => mergeMetaStudyProjects(userProjects, metaStudyProjects), [userProjects]);
  const visibleProjects = useMemo(() => allProjects.filter(isVisibleProject), [allProjects]);
  const archivedProjects = useMemo(() => allProjects.filter(isArchivedProject), [allProjects]);

  const selectedProject = useMemo(
    () => visibleProjects.find((project) => project.id === selectedProjectId),
    [selectedProjectId, visibleProjects],
  );

  const saveUserProjects = useCallback(async (projects: MetaStudyProject[]) => {
    try {
      const response = await fetch("/api/meta-analysis/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects }),
      });
      const payload = (await response.json().catch(() => ({}))) as UserMetaProjectsResponse;
      if (!response.ok) throw new Error(payload.error || "Failed to save meta study projects.");
      const storageLabel = payload.storage ? `${payload.storage.backend}: ${payload.storage.path}` : "shared storage";
      setProjectSyncError("");
      setProjectSyncNotice(`Study list synced to ${storageLabel}.`);
    } catch (caught) {
      setProjectSyncNotice("");
      setProjectSyncError(caught instanceof Error ? caught.message : "Study list could not be synced to shared storage.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUserProjects() {
      try {
        const response = await fetch("/api/meta-analysis/projects", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as UserMetaProjectsResponse;
        if (!response.ok) throw new Error(payload.error || "Failed to load meta study projects.");

        const serverProjects = Array.isArray(payload.projects) ? payload.projects : [];
        if (cancelled) return;

        if (payload.storage) {
          setProjectSyncNotice(`Study list loaded from ${payload.storage.backend}: ${payload.storage.path}.`);
          setProjectSyncError("");
        }
        setUserProjects((current) => {
          const next = mergeMetaStudyProjects(serverProjects, current);
          window.localStorage.setItem(userMetaProjectsStorageKey, JSON.stringify(next));
          setSelectedProjectId((currentId) => {
            const nextAllProjects = mergeMetaStudyProjects(next, metaStudyProjects);
            if (currentId === "new-topic" || nextAllProjects.some((project) => project.id === currentId && isVisibleProject(project))) {
              return currentId;
            }
            return firstVisibleProjectId(nextAllProjects);
          });
          if (projectListSignature(serverProjects) !== projectListSignature(next)) void saveUserProjects(next);
          return next;
        });
      } catch (caught) {
        setProjectSyncError(caught instanceof Error ? caught.message : "Shared study list could not be loaded; using this browser only.");
      }
    }

    void loadUserProjects();
    return () => {
      cancelled = true;
    };
  }, [saveUserProjects]);

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

  function saveProjectList(next: MetaStudyProject[]) {
    window.localStorage.setItem(userMetaProjectsStorageKey, JSON.stringify(next));
    void saveUserProjects(next);
  }

  function upsertUserProject(project: MetaStudyProject, patch: Partial<MetaStudyProject>, selectProject = false) {
    setUserProjects((current) => {
      const nextProject = sanitizeMetaStudyProject({
        ...(current.find((item) => item.id === project.id) ?? project),
        ...project,
        ...patch,
      } as MetaStudyProject);
      if (!nextProject) return current;

      const next = mergeMetaStudyProjects(
        [nextProject],
        current.filter((item) => item.id !== project.id && !sameProjectTopic(item, nextProject)),
      );
      saveProjectList(next);

      const nextAllProjects = mergeMetaStudyProjects(next, metaStudyProjects);
      setSelectedProjectId((currentId) => {
        if (selectProject) return nextProject.id;
        if (currentId === project.id || !nextAllProjects.some((item) => item.id === currentId && isVisibleProject(item))) {
          return firstVisibleProjectId(nextAllProjects);
        }
        return currentId;
      });
      return next;
    });
  }

  function archiveProject(project: MetaStudyProject) {
    const now = new Date().toISOString();
    upsertUserProject(project, {
      visibility: "archived",
      archivedAt: now,
      deletedAt: undefined,
      updatedAt: now,
    });
    setProjectSyncNotice(`Archived "${projectMenuLabel(project)}".`);
  }

  function restoreProject(project: MetaStudyProject) {
    const now = new Date().toISOString();
    upsertUserProject(
      project,
      {
        visibility: "active",
        archivedAt: undefined,
        deletedAt: undefined,
        updatedAt: now,
      },
      true,
    );
    setShowArchivedProjects(false);
    setAiSettingsOpen(false);
    setStage("overview");
    setProjectSyncNotice(`Restored "${projectMenuLabel(project)}".`);
  }

  function deleteProject(project: MetaStudyProject) {
    const confirmed = window.confirm(`"${projectFullTitle(project)}" 주제를 진행 중 연구 목록에서 삭제할까요?`);
    if (!confirmed) return;

    const now = new Date().toISOString();
    upsertUserProject(project, {
      visibility: "deleted",
      archivedAt: undefined,
      deletedAt: now,
      updatedAt: now,
    });
    setProjectSyncNotice(`Deleted "${projectMenuLabel(project)}" from the active study list.`);
  }

  function addUserProject(project: MetaStudyProject) {
    setUserProjects((current) => {
      const now = new Date().toISOString();
      const existingProject = mergeMetaStudyProjects(current, metaStudyProjects).find(
        (item) => projectVisibility(item) !== "deleted" && sameProjectTopic(item, project),
      );
      const nextProject = sanitizeMetaStudyProject({
        ...(existingProject ?? project),
        ...project,
        id: existingProject?.id ?? project.id,
        visibility: "active",
        archivedAt: undefined,
        deletedAt: undefined,
        updatedAt: now,
      } as MetaStudyProject);
      if (!nextProject) return current;

      const next = mergeMetaStudyProjects(
        [nextProject],
        current.filter((item) => item.id !== nextProject.id && !sameProjectTopic(item, nextProject)),
      );
      saveProjectList(next);
      setSelectedProjectId(nextProject.id);
      setProjectSyncNotice(
        existingProject
          ? `Same-title study updated instead of creating a duplicate: ${projectMenuLabel(nextProject)}.`
          : `New study added: ${projectMenuLabel(nextProject)}.`,
      );
      return next;
    });
    setAiSettingsOpen(false);
    setStage("protocol");
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
            {visibleProjects.length}
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
          {visibleProjects.map((project) => (
            <div
              key={project.id}
              className={`overflow-hidden rounded-md border transition ${
                selectedProjectId === project.id
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <button
                type="button"
                onClick={() => openProject(project)}
                title={projectFullTitle(project)}
                aria-label={projectFullTitle(project)}
                className={`w-full text-left transition ${
                  projectMenuCollapsed ? "flex h-12 items-center justify-center p-0" : "p-3"
                } ${
                  selectedProjectId === project.id
                    ? "bg-emerald-50"
                    : "bg-white hover:bg-zinc-50"
                }`}
              >
                {projectMenuCollapsed ? <Database className="h-4 w-4 text-emerald-700" aria-hidden /> : null}
                <span className={projectMenuCollapsed ? "sr-only" : "block text-sm font-semibold leading-5 text-zinc-950"}>{projectMenuLabel(project)}</span>
                {!projectMenuCollapsed ? <span className="mt-2 block text-xs leading-5 text-zinc-500">{project.status}</span> : null}
                {!projectMenuCollapsed ? (
                  <span className="mt-3 block h-2 overflow-hidden rounded-full bg-zinc-100">
                    <span className="block h-full bg-emerald-600" style={{ width: `${project.progress}%` }} />
                  </span>
                ) : null}
                {!projectMenuCollapsed ? <span className="mt-2 block text-xs font-semibold text-emerald-700">{project.progress}% designed</span> : null}
              </button>
              {!projectMenuCollapsed ? (
                <div className="grid grid-cols-2 border-t border-zinc-100 bg-zinc-50">
                  <button
                    type="button"
                    onClick={() => archiveProject(project)}
                    title="보관"
                    aria-label={`${projectMenuLabel(project)} 보관`}
                    className="inline-flex h-9 items-center justify-center gap-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-amber-50 hover:text-amber-800"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden />
                    보관
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProject(project)}
                    title="삭제"
                    aria-label={`${projectMenuLabel(project)} 삭제`}
                    className="inline-flex h-9 items-center justify-center gap-1.5 border-l border-zinc-100 text-xs font-semibold text-zinc-600 transition hover:bg-rose-50 hover:text-rose-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {visibleProjects.length === 0 && !projectMenuCollapsed ? (
            <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
              진행 중 연구가 없습니다. 신규 주제를 AI 분석해 추가하세요.
            </div>
          ) : null}
        </div>

        {archivedProjects.length > 0 && !projectMenuCollapsed ? (
          <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
            <button
              type="button"
              onClick={() => setShowArchivedProjects((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold uppercase text-zinc-600"
            >
              <span className="inline-flex items-center gap-2">
                <Archive className="h-4 w-4 text-amber-700" aria-hidden />
                보관함
              </span>
              <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">{archivedProjects.length}</span>
            </button>
            {showArchivedProjects ? (
              <div className="mt-3 grid gap-2">
                {archivedProjects.map((project) => (
                  <div key={project.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
                    <p className="text-sm font-semibold leading-5 text-zinc-900">{projectMenuLabel(project)}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{projectFullTitle(project)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => restoreProject(project)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-white text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        복원
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProject(project)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-white text-xs font-semibold text-rose-800 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

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
        {projectSyncError && !projectMenuCollapsed ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-900">
            Study list sync failed: {projectSyncError}
          </div>
        ) : null}
        {projectSyncNotice && !projectSyncError && !projectMenuCollapsed ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-900">
            {projectSyncNotice}
          </div>
        ) : null}
      </aside>

      <section className="min-w-0">
        {aiSettingsOpen ? (
          <MetaAiSettingsPanel />
        ) : selectedProject ? (
          <ProjectWorkspace key={selectedProject.id} project={selectedProject} stage={stage} setStage={setStage} initialSearchQuery={initialSearchQuery} />
        ) : (
          <NewTopicWorkspace onCreateProject={addUserProject} />
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
            <h2 className="mt-1 max-w-4xl break-words text-2xl font-semibold leading-tight tracking-normal text-zinc-950">
              {projectFullTitle(project)}
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
  const copy = overviewStageCopy(project);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Overview"
        title={copy.title}
        detail={copy.detail}
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
  const storageKey = `${protocolDraftStorageKey}:${project.id}`;
  const copy = protocolStageCopy(project);
  const [protocolPaste, setProtocolPaste] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [parseNotice, setParseNotice] = useState("");
  const [sharedStateNotice, setSharedStateNotice] = useState("");
  const [sharedStateError, setSharedStateError] = useState("");
  const [draft, setDraft] = useState(() => readStoredJson(storageKey, initialProtocolDraft(project)));

  useEffect(() => {
    let cancelled = false;

    loadProjectWorkspaceState(project.id)
      .then((state) => {
        if (cancelled || !isPlainRecord(state.protocolDraft)) return;
        const nextDraft = { ...initialProtocolDraft(project), ...(state.protocolDraft as Partial<ProtocolDraft>) };
        setDraft(nextDraft);
        window.localStorage.setItem(storageKey, JSON.stringify(nextDraft));
        setSharedStateNotice(state.updatedAt ? `Shared state loaded: ${new Date(state.updatedAt).toLocaleString("ko-KR")}` : "Shared state loaded.");
      })
      .catch((caught) => {
        if (!cancelled) setSharedStateError(caught instanceof Error ? caught.message : "Shared protocol state could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [project, project.id, storageKey]);

  function updateProtocolField(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveProtocolDraft() {
    const nextSavedAt = new Date().toISOString();
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    setSavedAt(nextSavedAt);
    setSharedStateError("");
    try {
      await saveProjectWorkspaceState(project.id, { protocolDraft: draft });
      setSharedStateNotice(`Shared state saved: ${new Date(nextSavedAt).toLocaleString("ko-KR")}`);
    } catch (caught) {
      setSharedStateError(caught instanceof Error ? caught.message : "Shared protocol state could not be saved.");
    }
  }

  function parseProtocolPaste() {
    const input = protocolPaste.trim();
    if (input.length < 20) {
      setParseNotice("붙여넣은 protocol 초안이 너무 짧습니다. PICO/PEO, eligibility, synthesis 문장을 포함해 주세요.");
      return;
    }

    const nextDraft = parseProtocolDraftText(input, draft);
    const changedFields = (Object.keys(nextDraft) as Array<keyof ProtocolDraft>).filter(
      (field) => nextDraft[field] !== draft[field],
    );
    setDraft(nextDraft);
    setParseNotice(
      changedFields.length > 0
        ? `자동 parsing 완료: ${changedFields.join(", ")} 항목을 갱신했습니다.`
        : "자동 parsing을 실행했지만 새로 갱신할 항목을 찾지 못했습니다. 아래 항목을 직접 수정해 주세요.",
    );
  }

  const protocolPrompt = [
    "You are a PRISMA 2020 systematic review protocol reviewer.",
    "Review and improve the following protocol draft without changing the research intent.",
    "",
    `Population: ${draft.population}`,
    `Exposure: ${draft.exposure}`,
    `Comparator: ${draft.comparator}`,
    `Outcomes: ${draft.outcomes}`,
    `Eligibility: ${draft.eligibility}`,
    `Exclusion: ${draft.exclusion}`,
    `Synthesis: ${draft.synthesis}`,
    "",
    protocolPaste,
  ].join("\n");
  const protocolFields = [
    ["population", "Population"],
    ["exposure", "Exposure"],
    ["comparator", "Comparator"],
    ["outcomes", "Outcomes"],
    ["eligibility", "Inclusion / eligibility"],
    ["exclusion", "Exclusion rule"],
    ["synthesis", "Synthesis plan"],
  ] as const;

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="PRISMA Protocol"
        title={copy.title}
        detail={copy.detail}
      />
      <div className="grid gap-3 lg:grid-cols-4">
        {protocolFields.slice(0, 4).map(([field, label]) => (
          <div key={field} className="rounded-md border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
            <p className="mt-2 max-h-16 overflow-hidden text-sm leading-5 text-zinc-800">
              {draft[field] || "Needs confirmation."}
            </p>
          </div>
        ))}
      </div>
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Editable PRISMA protocol draft</p>
            <p className="mt-1 text-sm leading-6 text-zinc-700">
              ChatGPT/Gemini에서 작성한 protocol 초안을 붙여 넣고, 연구자가 PICO/PEO와 eligibility를 직접 수정한 뒤 저장합니다.
            </p>
            {savedAt ? <p className="mt-2 text-xs font-semibold text-emerald-800">저장완료: {new Date(savedAt).toLocaleString("ko-KR")}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={parseProtocolPaste}
              disabled={protocolPaste.trim().length < 20}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              <Workflow className="h-4 w-4" aria-hidden />
              붙여넣은 초안 자동 parsing
            </button>
            <button
              type="button"
              onClick={() => void saveProtocolDraft()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              <Save className="h-4 w-4" aria-hidden />
              Protocol draft 저장
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(protocolPrompt)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              외부 AI 검토 prompt 복사
            </button>
          </div>
        </div>
        {parseNotice ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800">
            {parseNotice}
          </p>
        ) : null}
        {sharedStateNotice ? (
          <p className="mt-3 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800">
            {sharedStateNotice}
          </p>
        ) : null}
        {sharedStateError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {sharedStateError}
          </p>
        ) : null}
        <details className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
            AI draft paste and parsing
          </summary>
        <label className="mt-3 grid gap-2 text-sm font-semibold text-zinc-700">
          AI protocol draft 붙여넣기
          <textarea
            value={protocolPaste}
            onChange={(event) => setProtocolPaste(event.target.value)}
            rows={5}
            placeholder="ChatGPT/Gemini가 작성한 PICO, inclusion/exclusion, outcome hierarchy, synthesis plan을 붙여 넣으세요."
            className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-500"
          />
        </label>
        </details>
        <details className="mt-3 rounded-md border border-emerald-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
            Edit PICO/PEO and protocol fields
          </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {protocolFields.map(([field, label]) => (
            <label
              key={field}
              className={
                field === "synthesis"
                  ? "grid gap-1 text-xs font-semibold uppercase text-zinc-500 lg:col-span-2"
                  : "grid gap-1 text-xs font-semibold uppercase text-zinc-500"
              }
            >
              {label}
              <textarea
                value={draft[field]}
                onChange={(event) => updateProtocolField(field, event.target.value)}
                rows={field === "synthesis" ? 3 : 2}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-900 outline-none focus:border-emerald-500"
              />
            </label>
          ))}
        </div>
        </details>
      </section>
      <details className="rounded-md border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
          Exposure classification and feature notes
        </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {project.exposureGroups.map((group) => (
          <article key={group.group} className="rounded-md border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-950">{group.group}</p>
            <p className="mt-2 text-xs font-semibold uppercase text-emerald-700">{group.instruments}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{group.interpretation}</p>
          </article>
        ))}
      </div>
      <section className="mt-4">
        <h3 className="text-base font-semibold text-zinc-950">{copy.featureHeading}</h3>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {project.exposureFeatures.map((item) => (
            <div key={item.feature} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-sm font-semibold text-zinc-950">{item.feature}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">{item.definition}</p>
            </div>
          ))}
        </div>
      </section>
      </details>
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
  type SearchImportRow = { resultCount: string; exportFile: string; notes: string; completedAt: string };
  const storageKey = `${searchImportStorageKey}:${project.id}`;
  const queryOverrideKey = `${searchQueryOverrideStorageKey}:${project.id}`;
  const databaseSelectionKey = `${searchDatabaseSelectionStorageKey}:${project.id}`;
  const copy = searchStageCopy(project);
  const [importRows, setImportRows] = useState<Record<string, SearchImportRow>>(() =>
    readStoredRecord<SearchImportRow>(storageKey),
  );
  const [importSavedAt, setImportSavedAt] = useState("");
  const [queryOverrides, setQueryOverrides] = useState<Record<string, string>>(() =>
    readStoredRecord<string>(queryOverrideKey),
  );
  const [querySavedAt, setQuerySavedAt] = useState("");
  const [uploadSummary, setUploadSummary] = useState<SearchUploadSummary | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [sharedStateNotice, setSharedStateNotice] = useState("");
  const [sharedStateError, setSharedStateError] = useState("");
  const [selectedDatabases, setSelectedDatabases] = useState<CanonicalSearchDatabase[]>(() =>
    normalizeDatabaseSelection(readStoredJson<unknown>(databaseSelectionKey, null), selectedSearchDatabasesForProject(project)),
  );
  const searchRuns = useMemo(
    () => searchRunsForDatabases(project, selectedDatabases),
    [project, selectedDatabases],
  );
  const selectedSearchResultCount = searchRuns.reduce((total, run) => total + run.resultCount, 0);

  useEffect(() => {
    let cancelled = false;

    loadProjectWorkspaceState(project.id)
      .then((state) => {
        if (cancelled) return;
        const nextImportRows = recordFromUnknown<SearchImportRow>(state.searchImportRows);
        const nextQueryOverrides = stringRecordFromUnknown(state.queryOverrides);
        const nextSelectedDatabases = normalizeDatabaseSelection(state.selectedDatabases, selectedSearchDatabasesForProject(project));
        let loaded = false;

        if (Object.keys(nextImportRows).length > 0) {
          setImportRows(nextImportRows);
          window.localStorage.setItem(storageKey, JSON.stringify(nextImportRows));
          loaded = true;
        }

        if (Object.keys(nextQueryOverrides).length > 0) {
          setQueryOverrides(nextQueryOverrides);
          window.localStorage.setItem(queryOverrideKey, JSON.stringify(nextQueryOverrides));
          loaded = true;
        }

        if (Array.isArray(state.selectedDatabases)) {
          setSelectedDatabases(nextSelectedDatabases);
          window.localStorage.setItem(databaseSelectionKey, JSON.stringify(nextSelectedDatabases));
          loaded = true;
        }

        if (loaded) {
          setSharedStateNotice(state.updatedAt ? `Shared search state loaded: ${new Date(state.updatedAt).toLocaleString("ko-KR")}` : "Shared search state loaded.");
        }
      })
      .catch((caught) => {
        if (!cancelled) setSharedStateError(caught instanceof Error ? caught.message : "Shared search state could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [databaseSelectionKey, project, project.id, queryOverrideKey, storageKey]);

  function persistSearchWorkspaceState(patch: ProjectWorkspaceState, savedAt: string) {
    setSharedStateError("");
    void saveProjectWorkspaceState(project.id, patch)
      .then(() => {
        setSharedStateNotice(`Shared search state saved: ${new Date(savedAt).toLocaleString("ko-KR")}`);
      })
      .catch((caught) => {
        setSharedStateError(caught instanceof Error ? caught.message : "Shared search state could not be saved.");
      });
  }

  function updateImportRow(database: string, field: "resultCount" | "exportFile" | "notes", value: string) {
    setImportRows((current) => {
      const previous = current[database] ?? { resultCount: "", exportFile: "", notes: "", completedAt: "" };
      return {
        ...current,
        [database]: {
          ...previous,
          [field]: field === "resultCount" ? value.replace(/[^\d]/g, "") : value,
        },
      };
    });
  }

  function saveSearchImportLog() {
    const completedAt = new Date().toISOString();
    const nextRows = Object.fromEntries(
      searchRuns.map((run) => {
        const previous = importRows[run.database] ?? { resultCount: "", exportFile: "", notes: "", completedAt: "" };
        return [run.database, { ...previous, completedAt }];
      }),
    );
    window.localStorage.setItem(storageKey, JSON.stringify(nextRows));
    setImportRows(nextRows);
    setImportSavedAt(completedAt);
    persistSearchWorkspaceState({ searchImportRows: nextRows }, completedAt);
  }

  function updateQueryOverride(database: string, value: string) {
    setQueryOverrides((current) => ({ ...current, [database]: value }));
  }

  function saveQueryOverrides() {
    const nextSavedAt = new Date().toISOString();
    window.localStorage.setItem(queryOverrideKey, JSON.stringify(queryOverrides));
    setQuerySavedAt(nextSavedAt);
    persistSearchWorkspaceState({ queryOverrides }, nextSavedAt);
  }

  function toggleDatabaseSelection(database: CanonicalSearchDatabase) {
    setSelectedDatabases((current) => {
      const nextSelection = current.includes(database)
        ? current.filter((item) => item !== database)
        : canonicalSearchDatabases.filter((item) => item === database || current.includes(item));
      const normalizedSelection = nextSelection.length > 0 ? nextSelection : [...defaultSelectedSearchDatabases];
      window.localStorage.setItem(databaseSelectionKey, JSON.stringify(normalizedSelection));
      persistSearchWorkspaceState({ selectedDatabases: normalizedSelection }, new Date().toISOString());
      return normalizedSelection;
    });
  }

  function generateDraftQueries() {
    const nextOverrides = { ...queryOverrides };
    for (const run of searchRuns) {
      nextOverrides[run.database] = draftSearchQueryForDatabase(project, run.database, run.query || pubMedQuery);
    }
    const nextSavedAt = new Date().toISOString();
    window.localStorage.setItem(queryOverrideKey, JSON.stringify(nextOverrides));
    setQueryOverrides(nextOverrides);
    setQuerySavedAt(nextSavedAt);
    persistSearchWorkspaceState({ queryOverrides: nextOverrides, selectedDatabases }, nextSavedAt);
  }

  function searchImportCsv() {
    return csvRows([
      ["database", "original_screenshot_count", "external_result_count", "export_file", "notes", "completed_at"],
      ...searchRuns.map((run) => [
        run.database,
        String(run.resultCount),
        importRows[run.database]?.resultCount ?? "",
        importRows[run.database]?.exportFile ?? "",
        importRows[run.database]?.notes ?? "",
        importRows[run.database]?.completedAt ?? "",
      ]),
    ]);
  }

  async function handleSearchExportUpload(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    setUploadError("");
    try {
      const fileTexts = await Promise.all(
        selectedFiles.map(async (file) => ({
          file,
          text: await file.text(),
        })),
      );
      const filesSummary = fileTexts.map(({ file, text }) => {
        const summary = summarizeImportedRecords(text);
        return {
          fileName: file.name,
          database: inferDatabaseFromFileName(file.name),
          rawCount: summary.rawCount,
          uniqueCount: summary.uniqueCount,
          duplicateCount: summary.duplicateCount,
        };
      });
      const combined = summarizeImportedRecords(fileTexts.map(({ text }) => text).join("\n\n"));
      const mechanicallyExcluded = combined.uniqueRecords
        .map((record) => ({ ...record, exclusionReason: mechanicalExclusionReason(record) }))
        .filter((record) => record.exclusionReason);
      const excludedKeys = new Set(mechanicallyExcluded.map((record) => record.key));
      setUploadSummary({
        files: filesSummary,
        rawCount: combined.rawCount,
        uniqueCount: combined.uniqueCount,
        duplicateCount: combined.duplicateCount,
        mechanicallyExcluded,
        screeningReady: combined.uniqueRecords.filter((record) => !excludedKeys.has(record.key)),
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Search export files could not be read.");
    }
  }

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Search Design"
        title={copy.title}
        detail={copy.detail}
      />
      <div className="grid gap-3 lg:grid-cols-5">
        <Metric label="Records identified" value={selectedSearchResultCount.toLocaleString()} />
        <Metric label="Deduplicated master" value={prismaCount(project, "Records after deduplication")} />
        <Metric label="Abstract text" value={prismaCount(project, "Records with abstract text available")} />
        <Metric label="FT article plan" value={prismaCount(project, "Full-text assessment queue")} />
        <Metric label="Active Excel PDFs" value={activeFullTextUploadCount(project).toLocaleString()} />
      </div>
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Choose databases before generating queries</p>
            <p className="mt-1 text-sm leading-6 text-zinc-700">
              Select only the databases this review will actually search. The app then prepares draft syntax for those databases only.
            </p>
          </div>
          <button
            type="button"
            onClick={generateDraftQueries}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            <Workflow className="h-4 w-4" aria-hidden />
            Generate draft DB queries
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {canonicalSearchDatabases.map((database) => (
            <label
              key={database}
              className="flex min-h-11 items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
            >
              <input
                type="checkbox"
                checked={selectedDatabases.includes(database)}
                onChange={() => toggleDatabaseSelection(database)}
                className="h-4 w-4 accent-emerald-700"
              />
              {database}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-emerald-900">
          PubMed and Cochrane can open with the query in the URL. Embase, Scopus, and Web of Science open the advanced search page; use Copy for the query text.
        </p>
        {sharedStateNotice ? (
          <p className="mt-3 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800">
            {sharedStateNotice}
          </p>
        ) : null}
        {sharedStateError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {sharedStateError}
          </p>
        ) : null}
      </section>
      <section className="rounded-md border border-zinc-200">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">{copy.logTitle}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {copy.logDetail}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(searchLogCsv(project, queryOverrides, selectedDatabases))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            search log CSV 복사
            </button>
            <ProjectFileSaveButton
              projectId={project.id}
              fileName="search-log.csv"
              contents={() => searchLogCsv(project, queryOverrides, selectedDatabases)}
              label="Save CSV"
            />
            <button
              type="button"
              onClick={saveQueryOverrides}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              <Save className="h-4 w-4" aria-hidden />
              DB queries 저장
            </button>
          </div>
        </div>
        {querySavedAt ? (
          <p className="border-b border-zinc-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
            DB query 저장완료: {new Date(querySavedAt).toLocaleString("ko-KR")}
          </p>
        ) : null}
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
              {searchRuns.map((run) => {
                const overrideQuery = queryOverrides[run.database] ?? "";
                const searchQuery = overrideQuery.trim()
                  ? cleanSearchQueryText(overrideQuery)
                  : draftSearchQueryForDatabase(project, run.database, run.query || pubMedQuery);
                const runUrl = databaseSearchUrl(run.database, searchQuery, pubMedUrl);
                const queryIssue = searchQuery ? "" : "Generate a draft query or paste a database-specific query before running this database.";
                return (
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
                    {runUrl ? (
                      <a
                        href={runUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-2 inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-700 px-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Open
                      </a>
                    ) : null}
                    {searchQuery ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard?.writeText(searchQuery)}
                          className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                          복사
                        </button>
                        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-[11px] leading-4 text-zinc-700">
                          {searchQuery}
                        </pre>
                      </>
                    ) : (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold leading-5 text-amber-900">
                        {queryIssue}
                      </p>
                    )}
                    <label className="mt-2 grid gap-1 text-[11px] font-semibold uppercase text-zinc-500">
                      DB-specific query override
                      <textarea
                        value={overrideQuery}
                        onChange={(event) => updateQueryOverride(run.database, event.target.value)}
                        rows={3}
                        placeholder={`Paste or edit the ${run.database} query, then save DB queries.`}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs font-normal normal-case leading-5 text-zinc-800 outline-none focus:border-emerald-500"
                      />
                    </label>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900">External search result import log</p>
            <p className="mt-1 text-sm leading-6 text-zinc-700">
              PubMed 외 DB에서 직접 검색한 실제 결과 수와 export 파일명을 입력하고 저장합니다.
            </p>
            {importSavedAt ? <p className="mt-2 text-xs font-semibold text-emerald-800">저장완료: {new Date(importSavedAt).toLocaleString("ko-KR")}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveSearchImportLog}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              <Save className="h-4 w-4" aria-hidden />
              Search log 저장
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(searchImportCsv())}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Import log CSV 복사
            </button>
            <ProjectFileSaveButton
              projectId={project.id}
              fileName="search-import-log.csv"
              contents={() => searchImportCsv()}
              label="Save import CSV"
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-md border border-emerald-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-900">
              <tr>
                <th className="border-b border-emerald-200 px-3 py-3">Database</th>
                <th className="border-b border-emerald-200 px-3 py-3">Screenshot n</th>
                <th className="border-b border-emerald-200 px-3 py-3">Actual n</th>
                <th className="border-b border-emerald-200 px-3 py-3">Export file</th>
                <th className="border-b border-emerald-200 px-3 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {searchRuns.map((run) => (
                <tr key={run.database}>
                  <td className="border-b border-zinc-100 px-3 py-3 font-semibold text-zinc-950">{run.database}</td>
                  <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{run.resultCount.toLocaleString()}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <input
                      value={importRows[run.database]?.resultCount ?? ""}
                      onChange={(event) => updateImportRow(run.database, "resultCount", event.target.value)}
                      className="h-9 w-28 rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-emerald-500"
                      inputMode="numeric"
                      placeholder="n"
                    />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <input
                      value={importRows[run.database]?.exportFile ?? ""}
                      onChange={(event) => updateImportRow(run.database, "exportFile", event.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="RIS/CSV/NBIB filename"
                    />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <input
                      value={importRows[run.database]?.notes ?? ""}
                      onChange={(event) => updateImportRow(run.database, "notes", event.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="date, filters, access notes"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Search export upload and mechanical cleanup</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Preferred input is RIS for all databases. PubMed NBIB, BibTeX, CSV/TSV, and plain TXT are accepted as fallback. The app normalizes records, deduplicates by DOI/PMID/title, and flags review, letter, editorial, conference abstract, book chapter, case report, and protocol records before title/abstract screening.
            </p>
          </div>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800">
            <FolderOpen className="h-4 w-4" aria-hidden />
            Upload exports
            <input
              type="file"
              multiple
              accept=".ris,.nbib,.txt,.csv,.tsv,.bib,.ciw"
              onChange={(event) => void handleSearchExportUpload(event.target.files)}
              className="sr-only"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {searchExportGuidance.map(([database, format, note]) => (
            <div key={database} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-sm font-semibold text-zinc-950">{database}</p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">{format}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-600">{note}</p>
            </div>
          ))}
        </div>
        {uploadError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {uploadError}
          </p>
        ) : null}
        {uploadSummary ? (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 lg:grid-cols-4">
              <Metric label="Uploaded raw records" value={uploadSummary.rawCount.toLocaleString()} />
              <Metric label="Unique after dedup" value={uploadSummary.uniqueCount.toLocaleString()} />
              <Metric label="Duplicates removed" value={uploadSummary.duplicateCount.toLocaleString()} />
              <Metric label="Screening ready" value={uploadSummary.screeningReady.length.toLocaleString()} />
            </div>
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="border-b border-zinc-200 px-3 py-3">File</th>
                    <th className="border-b border-zinc-200 px-3 py-3">Database</th>
                    <th className="border-b border-zinc-200 px-3 py-3">Raw</th>
                    <th className="border-b border-zinc-200 px-3 py-3">Unique in file</th>
                    <th className="border-b border-zinc-200 px-3 py-3">Duplicate in file</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadSummary.files.map((file) => (
                    <tr key={file.fileName}>
                      <td className="border-b border-zinc-100 px-3 py-3 font-semibold text-zinc-950">{file.fileName}</td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{file.database}</td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{file.rawCount.toLocaleString()}</td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{file.uniqueCount.toLocaleString()}</td>
                      <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{file.duplicateCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(searchUploadMasterCsv(uploadSummary))}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                Master CSV copy
              </button>
              <ProjectFileSaveButton
                projectId={project.id}
                fileName="search-master-after-dedup-and-mechanical-filter.csv"
                contents={() => searchUploadMasterCsv(uploadSummary)}
                label="Save master CSV"
              />
            </div>
            {uploadSummary.mechanicallyExcluded.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">
                  Mechanically excluded candidates: {uploadSummary.mechanicallyExcluded.length.toLocaleString()}
                </p>
                <ul className="mt-2 grid gap-1 text-xs leading-5 text-amber-900">
                  {uploadSummary.mechanicallyExcluded.slice(0, 8).map((record) => (
                    <li key={record.key}>
                      {record.exclusionReason}: {record.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
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
              {copy.prismaNote}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(prismaCsv(project))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            PRISMA CSV 복사
            </button>
            <ProjectFileSaveButton
              projectId={project.id}
              fileName="prisma-identification.csv"
              contents={() => prismaCsv(project)}
              label="Save PRISMA"
            />
          </div>
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
          {copy.flags.map((flag) => (
            <p key={flag}>{flag}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScreeningStage({ project }: { project: MetaStudyProject }) {
  const activeUploadCount = activeFullTextUploadCount(project);
  const copy = screeningStageCopy(project);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Screening"
        title={copy.title(activeUploadCount)}
        detail={copy.detail}
      />
      <ProjectStoragePanel project={project} />
      <WorkbookFullTextBoard project={project} />
      <section className="rounded-md border border-zinc-200">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Full-text triage queue</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{copy.queueDetail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(screeningDecisionColumns.join(","))}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            screening CSV header 복사
            </button>
            <ProjectFileSaveButton
              projectId={project.id}
              fileName="screening-decision-header.csv"
              contents={() => screeningDecisionColumns.join(",")}
              label="Save header"
            />
          </div>
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
        <Checklist title="Fixed full-text exclusion reasons" items={fullTextExclusionReasonsForProject(project)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {screeningRulesForProject(project).map(([title, detail]) => (
          <CheckCard key={title} title={title} detail={detail} />
        ))}
      </div>
      <MetaFullTextAssistant
        extractionColumns={project.extractionColumns}
        focus="screening"
        worksheetOptions={fullTextWorksheetOptions(project)}
      />
      <MetaExtractionDatasetPanel extractionSections={project.extractionSections} projectId={project.id} />
    </div>
  );
}

function ProjectStoragePanel({ project }: { project: MetaStudyProject }) {
  const [storage, setStorage] = useState<ProjectStorageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshStorage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStorage(await loadProjectStorage(project.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project storage could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;

    loadProjectStorage(project.id)
      .then((nextStorage) => {
        if (cancelled) return;
        setStorage(nextStorage);
        setError("");
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Project storage could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    function handleProjectFileSaved(event: Event) {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === project.id) void refreshStorage();
    }

    window.addEventListener(projectFileSavedEventName, handleProjectFileSaved);
    return () => {
      cancelled = true;
      window.removeEventListener(projectFileSavedEventName, handleProjectFileSaved);
    };
  }, [project.id, refreshStorage]);

  const files = storage?.files ?? [];

  return (
    <section className="rounded-md border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-sky-900">Project file storage</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">Screening CSV/data folder</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700">
            Clipboard exports are not files until they are saved here. Each project uses its own server folder.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshStorage()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Metric label="Project folder" value={storage?.folderName ?? "..."} />
        <Metric label="Saved files" value={loading ? "..." : files.length.toLocaleString()} />
        <Metric label="Storage mode" value={storage?.storageBackend === "google-drive" ? "Google Drive" : "Synology/local folder"} />
      </div>

      <div className="mt-4 grid gap-2 rounded-md border border-sky-200 bg-white p-3 text-xs leading-5 text-zinc-600">
        <p>
          <span className="font-semibold text-zinc-950">App path:</span>{" "}
          <span className="break-all">{storage?.projectPath ?? "Loading..."}</span>
        </p>
        {storage?.synologyPathHint ? (
          <p>
            <span className="font-semibold text-zinc-950">Synology host path:</span>{" "}
            <span className="break-all">{storage.synologyPathHint}</span>
          </p>
        ) : null}
        <p>
          <span className="font-semibold text-zinc-950">Root option:</span>{" "}
          <span className="break-all">
            {storage?.storageBackend === "google-drive" ? "META_PROJECT_STORAGE_BACKEND=google-drive, META_PROJECT_DRIVE_PREFIX" : "META_PROJECT_STORAGE_ROOT"}
          </span>
        </p>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      {files.length ? (
        <div className="mt-4 overflow-x-auto rounded-md border border-sky-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-sky-50 text-xs uppercase text-sky-900">
              <tr>
                <th className="border-b border-sky-200 px-3 py-3">File</th>
                <th className="border-b border-sky-200 px-3 py-3">Bytes</th>
                <th className="border-b border-sky-200 px-3 py-3">Updated</th>
                <th className="border-b border-sky-200 px-3 py-3">Path</th>
                <th className="border-b border-sky-200 px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.path}>
                  <td className="border-b border-zinc-100 px-3 py-3 font-semibold text-zinc-950">{file.fileName}</td>
                  <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{file.bytes.toLocaleString()}</td>
                  <td className="border-b border-zinc-100 px-3 py-3 text-zinc-700">{new Date(file.updatedAt).toLocaleString("ko-KR")}</td>
                  <td className="border-b border-zinc-100 px-3 py-3 text-xs leading-5 text-zinc-500">
                    <span className="break-all">{file.path}</span>
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <a
                      href={`/api/meta-analysis/projects/${encodeURIComponent(project.id)}/files/${encodeURIComponent(file.fileName)}`}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-sky-300 px-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-sky-200 bg-white p-3 text-sm leading-6 text-zinc-600">
          No project files have been saved yet.
        </p>
      )}
    </section>
  );
}

function ProjectFileSaveButton({
  projectId,
  fileName,
  contents,
  label,
}: {
  projectId: string;
  fileName: string;
  contents: string | (() => string);
  label: string;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function saveFile() {
    setStatus("saving");
    setError("");
    try {
      await saveProjectTextFile(projectId, fileName, typeof contents === "function" ? contents() : contents);
      setStatus("saved");
      window.dispatchEvent(new CustomEvent(projectFileSavedEventName, { detail: { projectId } }));
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Project file could not be saved.");
    }
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => void saveFile()}
        disabled={status === "saving"}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "saved" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <FolderOpen className="h-4 w-4" aria-hidden />}
        {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : label}
      </button>
      {error ? <p className="max-w-60 text-xs font-semibold text-rose-700">{error}</p> : null}
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
  const [sharedStateNotice, setSharedStateNotice] = useState("");
  const [sharedStateError, setSharedStateError] = useState("");
  const copy = workbookStageCopy(project);
  const activeSheets = project.workbookSheets.filter((sheet) => sheet.uploadRequired);
  const inactiveSheets = project.workbookSheets.filter((sheet) => !sheet.uploadRequired);

  useEffect(() => {
    window.localStorage.setItem(`${workbookBoardStorageKey}:${project.id}`, JSON.stringify(board));
  }, [board, project.id]);

  useEffect(() => {
    let cancelled = false;

    loadProjectWorkspaceState(project.id)
      .then((state) => {
        if (cancelled || !isPlainRecord(state.workbookBoard)) return;
        const initial = initialWorkbookBoardState(project.workbookSheets);
        const nextBoard = { ...initial, ...recordFromUnknown<WorkbookBoardState[string]>(state.workbookBoard) };
        setBoard(nextBoard);
        window.localStorage.setItem(`${workbookBoardStorageKey}:${project.id}`, JSON.stringify(nextBoard));
        setSharedStateNotice(state.updatedAt ? `Shared board loaded: ${new Date(state.updatedAt).toLocaleString("ko-KR")}` : "Shared board loaded.");
      })
      .catch((caught) => {
        if (!cancelled) setSharedStateError(caught instanceof Error ? caught.message : "Shared board state could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [project, project.id]);

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

  async function saveSharedBoardState() {
    const savedAt = new Date().toISOString();
    setSharedStateError("");
    try {
      await saveProjectWorkspaceState(project.id, { workbookBoard: board });
      setSharedStateNotice(`Shared board saved: ${new Date(savedAt).toLocaleString("ko-KR")}`);
    } catch (caught) {
      setSharedStateError(caught instanceof Error ? caught.message : "Shared board state could not be saved.");
    }
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
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">{copy.title}</h3>
          <details className="mt-3 max-w-4xl rounded-md border border-emerald-200 bg-white/80 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-900">Workbook rule</summary>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
            {copy.rule}
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
          <ProjectFileSaveButton
            projectId={project.id}
            fileName="workbook-fulltext-board.csv"
            contents={() => workbookBoardCsv()}
            label="Save board"
          />
          <button
            type="button"
            onClick={() => void saveSharedBoardState()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
          >
            <Save className="h-4 w-4" aria-hidden />
            Save shared state
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

      {sharedStateNotice ? (
        <p className="mt-3 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800">
          {sharedStateNotice}
        </p>
      ) : null}
      {sharedStateError ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {sharedStateError}
        </p>
      ) : null}

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
  const copy = extractionStageCopy(project);
  const validation = useMemo(() => validateExtractionCsv(csvText, project.extractionColumns), [csvText, project.extractionColumns]);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Extraction"
        title={copy.title}
        detail={copy.detail}
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
            placeholder={copy.placeholder}
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
  const copy = analysisStageCopy(project);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Analysis"
        title={copy.title}
        detail={copy.detail}
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
        {analysisSafeguardsForProject(project).map(([title, detail]) => (
          <CheckCard key={title} title={title} detail={detail} />
        ))}
      </div>
      <section className="rounded-md border border-zinc-200">
        <div className="border-b border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-950">Analysis readiness dashboard</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            현재는 extraction 전이므로 모든 정량 분석은 pending입니다. 이 주제의 primary/secondary outcome에 필요한 필드가 들어오면 분석 가능 여부를 확인합니다.
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
              {analysisReadinessRowsForProject(project).map(([outcome, required, status]) => (
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
  const copy = manuscriptStageCopy(project);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="Manuscript"
        title={copy.title}
        detail={copy.detail}
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
          {methodSentencesForProject(project).map((sentence) => (
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
  const searchRuns = Array.isArray(project.searchRuns) ? project.searchRuns : [];
  return searchRuns.reduce((total, run) => total + run.resultCount, 0);
}

function activeFullTextUploadCount(project: MetaStudyProject) {
  const workbookSheets = Array.isArray(project.workbookSheets) ? project.workbookSheets : [];
  return workbookSheets
    .filter((sheet) => sheet.uploadRequired)
    .reduce((total, sheet) => total + sheet.count, 0);
}

function prismaCount(project: MetaStudyProject, step: string) {
  const prismaRows = Array.isArray(project.prismaRows) ? project.prismaRows : [];
  const row = prismaRows.find((candidate) => candidate.step === step);
  return row?.count === null || row?.count === undefined ? "TBD" : row.count.toLocaleString();
}

function searchLogCsv(
  project: MetaStudyProject,
  queryOverrides: Record<string, string> = {},
  selectedDatabases = selectedSearchDatabasesForProject(project),
) {
  const searchRuns = searchRunsForDatabases(project, selectedDatabases);
  return csvRows([
    ["database", "searched_at", "label", "result_count", "limits", "source", "export_action", "query"],
    ...searchRuns.map((run) => [
      run.database,
      run.searchedAt,
      run.label,
      String(run.resultCount),
      run.limits,
      run.source,
      run.exportAction,
      queryOverrides[run.database]?.trim()
        ? cleanSearchQueryText(queryOverrides[run.database])
        : draftSearchQueryForDatabase(project, run.database, run.query),
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

async function loadProjectStorage(projectId: string) {
  const response = await fetch(`/api/meta-analysis/projects/${encodeURIComponent(projectId)}/files`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    storage?: ProjectStorageSummary;
    error?: string;
  };
  if (!response.ok || !payload.storage) {
    throw new Error(payload.error || "Project storage could not be loaded.");
  }
  return payload.storage;
}

async function saveProjectTextFile(projectId: string, fileName: string, contents: string) {
  const response = await fetch(`/api/meta-analysis/projects/${encodeURIComponent(projectId)}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contents }),
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<ProjectFileSaveResponse> & {
    error?: string;
  };
  if (!response.ok || !payload.savedFile || !payload.storage) {
    throw new Error(payload.error || "Project file could not be saved.");
  }
  return payload as ProjectFileSaveResponse;
}

async function loadProjectWorkspaceState(projectId: string) {
  const response = await fetch(`/api/meta-analysis/projects/${encodeURIComponent(projectId)}/state`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as ProjectWorkspaceStateResponse;
  if (!response.ok || !payload.state) {
    throw new Error(payload.error || "Project workspace state could not be loaded.");
  }
  return payload.state;
}

async function saveProjectWorkspaceState(projectId: string, patch: ProjectWorkspaceState) {
  const response = await fetch(`/api/meta-analysis/projects/${encodeURIComponent(projectId)}/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = (await response.json().catch(() => ({}))) as ProjectWorkspaceStateResponse;
  if (!response.ok || !payload.state) {
    throw new Error(payload.error || "Project workspace state could not be saved.");
  }
  window.dispatchEvent(new CustomEvent(projectFileSavedEventName, { detail: { projectId } }));
  return payload.state;
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
  const copy = referencesStageCopy(project);

  return (
    <div className="grid gap-5">
      <StageHeader
        eyebrow="References"
        title="핵심 근거는 클릭해서 직접 확인할 수 있게 둡니다"
        detail={copy.detail}
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

function NewTopicWorkspace({ onCreateProject }: { onCreateProject: (project: MetaStudyProject) => void }) {
  const starterQuery = "(Population terms) AND (Exposure or intervention terms) AND (Outcome terms)";
  const [sourceText, setSourceText] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisNotice, setAnalysisNotice] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [reviewItems, setReviewItems] = useState<string[]>([]);
  const [draft, setDraft] = useState<NewTopicDraft>(() =>
    readStoredJson<NewTopicDraft>(newTopicDraftStorageKey, {
      title: "",
      researchQuestion: "",
      population: "",
      exposure: "",
      outcomes: "",
      databases: "PubMed",
      eligibility: "",
      searchBlocks: starterQuery,
      extractionPlan: "",
    }),
  );

  function updateDraft(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function saveNewTopicDraft(nextDraft = draft, nextReviewItems = reviewItems, nextSourceText = sourceText) {
    const nextSavedAt = new Date().toISOString();
    window.localStorage.setItem(
      newTopicDraftStorageKey,
      JSON.stringify({ ...nextDraft, sourceText: nextSourceText, needsUserReview: nextReviewItems, savedAt: nextSavedAt }),
    );
    setSavedAt(nextSavedAt);
    return nextSavedAt;
  }

  const planningPrompt = [
    "You are helping design a PRISMA 2020 systematic review/meta-analysis project.",
    "Convert the idea below into PICO/PEO, eligibility, databases, search blocks, screening rules, extraction fields, and analysis plan.",
    "",
    sourceText || "(paste the research idea here)",
  ].join("\n");

  async function analyzeNewTopic() {
    const input = sourceText.trim();
    if (input.length < 20) {
      setAnalysisError("구상내용을 20자 이상 붙여넣은 뒤 AI 분석을 실행하세요.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisNotice("");
    setReviewItems([]);

    try {
      const response = await fetch("/api/meta-analysis/study-plan/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: input }),
      });
      const payload = (await response.json().catch(() => ({}))) as NewTopicAnalysisPayload;
      if (!response.ok) throw new Error(payload.error || "AI 분석 요청이 실패했습니다.");

      const parsedDraftPatch = Object.fromEntries(
        Object.entries(payload.draft ?? {}).filter(([, value]) => typeof value === "string"),
      ) as Partial<NewTopicDraft>;
      const nextDraft = { ...draft, ...parsedDraftPatch };
      const nextReviewItems = payload.needsUserReview ?? [];
      setDraft(nextDraft);
      setReviewItems(nextReviewItems);
      saveNewTopicDraft(nextDraft, nextReviewItems, input);
      setAnalysisNotice(
        payload.model
          ? `AI 분석 완료: ${payload.model} 결과를 저장하고 진행 중인 연구에 추가했습니다.`
          : `자동 parsing 완료: ${payload.note ?? "규칙 기반 분석 결과를 저장하고 진행 중인 연구에 추가했습니다."}`,
      );
      onCreateProject(createNewTopicProject(nextDraft, input, nextReviewItems));
    } catch (caught) {
      setAnalysisError(caught instanceof Error ? caught.message : "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <StageHeader
          eyebrow="New meta-analysis topic"
          title="구상내용을 AI로 분석해 연구계획 draft로 정리합니다"
          detail="신규 주제는 복사 버튼이 아니라 AI 분석으로 시작합니다. 붙여넣은 내용을 parsing한 뒤 연구자가 항목별로 수정하고 확정합니다."
        />
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <Metric label="1. Paste" value="구상내용, 검색식, DB 결과 수, 계획 변경사항을 그대로 붙여넣기" />
          <Metric label="2. AI analysis" value="AI가 제목, 질문, PECO, 검색, screening, extraction, 분석계획으로 parsing" />
          <Metric label="3. Review" value="사용자가 항목별로 수정하고 확정한 뒤 문서와 site draft 생성" />
        </div>
        <section className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-900">AI 분석 기반 신규 주제 draft</p>
              <p className="mt-1 text-sm leading-6 text-zinc-700">
                구상내용을 붙여넣고 `AI 분석 시작`을 누르면, 시스템이 연구계획 항목으로 자동 정리합니다. 결과는 저장 전 반드시 수동 수정·확정합니다.
              </p>
              {savedAt ? <p className="mt-2 text-xs font-semibold text-emerald-800">저장완료: {new Date(savedAt).toLocaleString("ko-KR")}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void analyzeNewTopic()}
                disabled={isAnalyzing || sourceText.trim().length < 20}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                <Search className="h-4 w-4" aria-hidden />
                {isAnalyzing ? "AI 분석 중" : "AI 분석 시작"}
              </button>
              <button
                type="button"
                onClick={() => saveNewTopicDraft()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                <Save className="h-4 w-4" aria-hidden />
                수정 내용 저장
              </button>
            </div>
          </div>
          {analysisNotice ? (
            <p className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800">
              {analysisNotice}
            </p>
          ) : null}
          {analysisError ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {analysisError}
            </p>
          ) : null}
          <label className="mt-4 grid gap-2 text-sm font-semibold text-zinc-700">
            구상내용 붙여넣기
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={6}
              placeholder="연구 아이디어, 검색식, database 결과 수, PDF 계획서 내용, 포함/제외 기준, 추출 변수, 분석 방향, 일정 등을 그대로 붙여넣으세요."
              className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-500"
            />
          </label>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {([
              ["title", "Working title"],
              ["researchQuestion", "Research question"],
              ["population", "Population"],
              ["exposure", "Exposure / predictor"],
              ["outcomes", "Outcomes"],
              ["databases", "Databases"],
              ["eligibility", "Eligibility / exclusion"],
              ["searchBlocks", "Search blocks"],
              ["extractionPlan", "Extraction / analysis plan"],
            ] as const).map(([field, label]) => (
              <label
                key={field}
                className={
                  field === "searchBlocks" || field === "extractionPlan"
                    ? "grid gap-1 text-xs font-semibold uppercase text-zinc-500 lg:col-span-2"
                    : "grid gap-1 text-xs font-semibold uppercase text-zinc-500"
                }
              >
                {label}
                <textarea
                  value={draft[field]}
                  onChange={(event) => updateDraft(field, event.target.value)}
                  rows={field === "searchBlocks" || field === "extractionPlan" ? 4 : 2}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-900 outline-none focus:border-emerald-500"
                />
              </label>
            ))}
          </div>
          {reviewItems.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">AI 분석 후 확인 필요</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
                {reviewItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
              고급 옵션: 외부 검토 prompt / 검색식 예시
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-zinc-800">외부 검토용 prompt</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  API 장애나 공동저자 검토가 필요할 때만 사용합니다. 신규 주제의 기본 흐름은 `AI 분석 시작`입니다.
                </p>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(planningPrompt)}
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  외부 검토 prompt 내보내기
                </button>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-800">검색식 구조 예시</p>
                <pre className="mt-2 rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">{starterQuery}</pre>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(starterQuery)}
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
                >
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  검색식 예시 복사
                </button>
              </div>
            </div>
          </details>
        </section>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <Checklist title="PRISMA start locks" items={newTopicLocks} />
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-950">확정 전 검토 기준</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
              <li>사용자가 직접 제공한 검색 결과 수와 검색식은 AI가 임의로 바꾸면 안 됩니다.</li>
              <li>AI 추론값은 PI가 확인한 뒤 `수정 내용 저장`으로 확정합니다.</li>
              <li>확정 후에만 protocol, extraction template, schedule, site draft로 넘깁니다.</li>
            </ul>
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
