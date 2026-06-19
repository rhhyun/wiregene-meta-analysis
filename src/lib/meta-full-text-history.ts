import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";
import type { MetaFullTextAnalysis } from "./meta-full-text-analysis";
import {
  deleteMetaFullTextSourceFile,
  normalizeMetaFullTextSourceFile,
  type MetaFullTextSourceFile,
} from "./meta-full-text-source-files";
import {
  cleanMetaProjectId,
  metaProjectScopedDriveFileName,
  metaProjectScopedLocalPath,
  type MetaProjectScope,
} from "./meta-project-scope";
import { isServerlessRuntime, resolveMetaJsonStorageBackend } from "./meta-storage-policy";

export type MetaFullTextVerification = {
  verificationMode: "dual_reviewer" | "ai_only";
  reviewerOneName: string;
  reviewerTwoName: string;
  reviewerOneDecision: string;
  reviewerTwoDecision: string;
  fixedExclusionReason: string;
  conflictStatus: string;
  reviewerNotes: string;
  reviewerReviewSkippedAt: string | null;
  reviewerReviewSkipReason: string;
  piName: string;
  piFinalDecision: string;
  piFinalReason: string;
  piAdjudicatedAt: string | null;
  updatedAt: string | null;
};

export type MetaFullTextExtractionReview = {
  rows: Record<string, string>[];
  verified: boolean;
  verificationNotes: string;
  verifiedBy: string;
  updatedAt: string | null;
  verifiedAt: string | null;
};

export type MetaFullTextHistoryRecord = {
  id: string;
  fileName: string;
  sourceSheet: string | null;
  sourceLabel: string | null;
  reviewMode: string | null;
  referenceRecord: string | null;
  savedAt: string;
  sourceFile: MetaFullTextSourceFile | null;
  analysis: MetaFullTextAnalysis;
  verification: MetaFullTextVerification;
  extractionReview: MetaFullTextExtractionReview;
  analysisArchive?: MetaFullTextAnalysisArchiveEntry[];
};

export type MetaFullTextAnalysisArchiveEntry = {
  archivedAt: string;
  analysis: MetaFullTextAnalysis;
};

export type MetaFullTextHistorySummary = {
  id: string;
  fileName: string;
  sourceSheet: string | null;
  sourceLabel: string | null;
  reviewMode: string | null;
  savedAt: string;
  analyzedAt: string;
  titleGuess: string | null;
  decision: MetaFullTextAnalysis["eligibility"]["decision"];
  confidence: number;
  aiUsed: boolean;
  model: string | null;
  aiWarning: string | null;
  modelReviewCount: number;
  aiModelReviewCount: number;
  modelReviewLabels: string[];
  modelReviewModels: string[];
  reviewScore: number;
  reviewGrade: string;
  extractionRowCount: number;
  missingCriticalFieldCount: number;
  validationIssueCount: number;
  sourceFileSaved: boolean;
  sourceStorage: MetaFullTextSourceFile["storage"] | null;
  verificationComplete: boolean;
  verificationMode: MetaFullTextVerification["verificationMode"];
  reviewerReviewSkippedAt: string | null;
  reviewerOneName: string;
  reviewerTwoName: string;
  reviewerOneDecision: string;
  reviewerTwoDecision: string;
  fixedExclusionReason: string;
  conflictStatus: string;
  piName: string;
  piFinalDecision: string;
  piAdjudicatedAt: string | null;
};

export type MetaFullTextReviewerSettings = {
  reviewerOneName: string;
  reviewerTwoName: string;
  updatedAt: string | null;
};

export type MetaFullTextHistoryStats = {
  totalCount: number;
  verificationCompletedCount: number;
};

type MetaFullTextHistoryData = {
  records: MetaFullTextHistoryRecord[];
  reviewerSettings: MetaFullTextReviewerSettings;
};

export type MetaFullTextHistoryScope = MetaProjectScope;

type MetaFullTextHistoryStorageErrorDetails = {
  operation: "read" | "write" | "backup-corrupt-json";
  path: string;
  backend: "local-json" | "google-drive";
  code?: string;
  message: string;
  help: string;
  backupPath?: string;
};

export class MetaFullTextHistoryStorageError extends Error {
  readonly details: MetaFullTextHistoryStorageErrorDetails;

  constructor(message: string, details: MetaFullTextHistoryStorageErrorDetails) {
    super(message);
    this.name = "MetaFullTextHistoryStorageError";
    this.details = details;
  }
}

const defaultStoragePath = ".data/meta/meta-full-text-history.json";
const defaultLegacyProjectId = "orchestral-prmd-asymmetry";
const maxStoredRecords = 500;

export async function saveMetaFullTextHistory(input: {
  analysis: MetaFullTextAnalysis;
  sourceSheet?: string | null;
  sourceLabel?: string | null;
  reviewMode?: string | null;
  referenceRecord?: string | null;
  reviewerOneName?: string | null;
  reviewerTwoName?: string | null;
  sourceFile?: MetaFullTextSourceFile | null;
  projectId?: string | null;
}) {
  const scope = historyScope(input);
  const data = await readHistoryData(scope);
  const reviewerSettings = mergeReviewerSettings(data.reviewerSettings, {
    reviewerOneName: input.reviewerOneName,
    reviewerTwoName: input.reviewerTwoName,
  });
  if (reviewerSettings.reviewerOneName || reviewerSettings.reviewerTwoName) {
    data.reviewerSettings = {
      ...reviewerSettings,
      updatedAt: new Date().toISOString(),
    };
  }
  const record: MetaFullTextHistoryRecord = {
    id: `mfta_${new Date().toISOString().replace(/[-:.TZ]/g, "")}_${crypto.randomUUID().slice(0, 8)}`,
    fileName: input.analysis.fileName,
    sourceSheet: cleanOptional(input.sourceSheet),
    sourceLabel: cleanOptional(input.sourceLabel),
    reviewMode: cleanOptional(input.reviewMode),
    referenceRecord: cleanOptional(input.referenceRecord),
    savedAt: new Date().toISOString(),
    sourceFile: input.sourceFile ?? null,
    analysis: input.analysis,
    verification: emptyVerification(data.reviewerSettings),
    extractionReview: emptyExtractionReview(),
    analysisArchive: [],
  };

  data.records = [record, ...data.records.filter((item) => item.id !== record.id)].slice(0, maxStoredRecords);
  await writeHistoryData(data, scope);
  return record;
}

export async function findMetaFullTextDuplicateRecord(
  input: {
    targetId?: string | null;
    fileName?: string | null;
    sourceFile?: MetaFullTextSourceFile | null;
    analysis?: MetaFullTextAnalysis | null;
  },
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  const targetId = cleanString(input.targetId);
  if (targetId) {
    const targeted = data.records.find((record) => record.id === targetId);
    if (targeted) return { record: targeted, matchedBy: "target_id" as const };
  }

  const normalizedSourceFile = normalizeMetaFullTextSourceFile(input.sourceFile);
  const sourceSha256 = cleanString(normalizedSourceFile?.sha256 || input.analysis?.sourceFileSha256);
  if (sourceSha256) {
    const bySourceHash = data.records.find(
      (record) => cleanString(record.sourceFile?.sha256 || record.analysis.sourceFileSha256) === sourceSha256,
    );
    if (bySourceHash) return { record: bySourceHash, matchedBy: "source_sha256" as const };
  }

  const fileKey = duplicateTextKey(input.fileName || input.analysis?.fileName || "");
  if (fileKey) {
    const byFileName = data.records.find((record) => duplicateTextKey(record.fileName || record.analysis.fileName) === fileKey);
    if (byFileName) return { record: byFileName, matchedBy: "file_name" as const };
  }

  const titleKey = duplicateTextKey(input.analysis?.titleGuess || "");
  if (titleKey) {
    const byTitle = data.records.find((record) => duplicateTextKey(record.analysis.titleGuess || "") === titleKey);
    if (byTitle) return { record: byTitle, matchedBy: "title" as const };
  }

  return null;
}

export async function mergeMetaFullTextHistoryAnalysis(
  id: string,
  analysis: MetaFullTextAnalysis,
  sourceFile: MetaFullTextSourceFile | null,
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  const index = data.records.findIndex((record) => record.id === id);
  if (index < 0) return null;
  const current = data.records[index];
  const normalizedSourceFile = normalizeMetaFullTextSourceFile(sourceFile) ?? current.sourceFile;
  const nextAnalysis = mergeFullTextAnalyses(current.analysis, analysis);

  data.records[index] = {
    ...current,
    fileName: current.fileName || analysis.fileName,
    sourceFile: normalizedSourceFile,
    analysis: {
      ...nextAnalysis,
      sourceFileSha256:
        cleanString(normalizedSourceFile?.sha256) || nextAnalysis.sourceFileSha256 || current.analysis.sourceFileSha256,
    },
    analysisArchive: [
      {
        archivedAt: new Date().toISOString(),
        analysis: current.analysis,
      },
      ...(current.analysisArchive ?? []),
    ].slice(0, 10),
  };
  await writeHistoryData(data, scope);
  return data.records[index];
}

export async function deleteMetaFullTextHistoryRecord(id: string, scope: MetaFullTextHistoryScope = {}) {
  const deleted = await deleteMetaFullTextHistoryRecords([id], scope);
  if (!deleted || deleted.records.length === 0) return null;

  return {
    record: deleted.records[0],
    stats: deleted.stats,
    sourceFileDeleted: deleted.sourceFileDeletedCount > 0,
    sourceFileDeleteWarning: deleted.sourceFileDeleteWarnings[0] ?? null,
  };
}

export async function deleteMetaFullTextHistoryRecords(ids: string[], scope: MetaFullTextHistoryScope = {}) {
  const requestedIds = Array.from(new Set(ids.map(cleanString).filter(Boolean)));
  if (requestedIds.length === 0) return null;

  const idSet = new Set(requestedIds);
  const data = await readHistoryData(scope);
  const records: MetaFullTextHistoryRecord[] = [];
  const remainingRecords: MetaFullTextHistoryRecord[] = [];

  for (const record of data.records) {
    if (idSet.has(record.id)) {
      records.push(record);
    } else {
      remainingRecords.push(record);
    }
  }

  if (records.length === 0) return null;

  data.records = remainingRecords;
  await writeHistoryData(data, scope);

  const seenSourceFileKeys = new Set<string>();
  const sourceFileDeleteWarnings: string[] = [];
  let sourceFileDeletedCount = 0;

  for (const record of records) {
    const sourceFile = normalizeMetaFullTextSourceFile(record.sourceFile);
    if (!sourceFile) continue;

    const sourceFileKey = sourceFileReferenceKey(sourceFile);
    if (sourceFileKey && seenSourceFileKeys.has(sourceFileKey)) continue;
    if (sourceFileKey) seenSourceFileKeys.add(sourceFileKey);
    if (isSourceFileReferencedByRecords(sourceFile, data.records)) continue;

    try {
      const deletedSource = await deleteMetaFullTextSourceFile(sourceFile, scopeProjectId(scope));
      if (deletedSource.deleted) sourceFileDeletedCount += 1;
      if (deletedSource.warning) sourceFileDeleteWarnings.push(`${sourceFile.fileName}: ${deletedSource.warning}`);
    } catch (error) {
      sourceFileDeleteWarnings.push(`${sourceFile.fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    records,
    stats: historyStats(data.records),
    sourceFileDeletedCount,
    sourceFileDeleteWarnings,
  };
}

function sourceFileReferenceKey(sourceFile: MetaFullTextSourceFile) {
  const driveFileId = cleanString(sourceFile.driveFileId);
  if (driveFileId) return `drive:${driveFileId}`;
  const localPath = cleanString(sourceFile.localPath);
  if (localPath) return `local:${localPath}`;
  const sha256 = cleanString(sourceFile.sha256);
  if (sha256) return `sha256:${sha256}`;
  return "";
}

function isSourceFileReferencedByRecords(sourceFile: MetaFullTextSourceFile, records: MetaFullTextHistoryRecord[]) {
  const sha256 = cleanString(sourceFile.sha256);
  const driveFileId = cleanString(sourceFile.driveFileId);
  const localPath = cleanString(sourceFile.localPath);
  return records.some((record) => {
    const current = normalizeMetaFullTextSourceFile(record.sourceFile);
    if (!current) return false;
    return Boolean(
      (sha256 && cleanString(current.sha256) === sha256) ||
        (driveFileId && cleanString(current.driveFileId) === driveFileId) ||
        (localPath && cleanString(current.localPath) === localPath),
    );
  });
}

export async function listMetaFullTextHistory(limit = 50, scope: MetaFullTextHistoryScope = {}) {
  const data = await readHistoryData(scope);
  return data.records
    .slice()
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, Math.max(1, Math.min(limit, maxStoredRecords)))
    .map(toSummary);
}

export async function getMetaFullTextHistoryOverview(limit = 50, scope: MetaFullTextHistoryScope = {}) {
  const data = await readHistoryData(scope);
  const sorted = data.records.slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return {
    records: sorted.slice(0, Math.max(1, Math.min(limit, maxStoredRecords))).map(toSummary),
    reviewerSettings: data.reviewerSettings,
    stats: historyStats(data.records),
  };
}

export async function getMetaFullTextHistoryRecord(id: string, scope: MetaFullTextHistoryScope = {}) {
  const data = await readHistoryData(scope);
  return data.records.find((record) => record.id === id) ?? null;
}

export async function getMetaFullTextHistoryRecords(scope: MetaFullTextHistoryScope = {}) {
  const data = await readHistoryData(scope);
  return data.records.slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function updateMetaFullTextVerification(
  id: string,
  verification: Partial<MetaFullTextVerification>,
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  const index = data.records.findIndex((record) => record.id === id);
  if (index < 0) return null;
  const currentVerification = data.records[index].verification;
  const nextVerificationMode =
    verification.verificationMode === "ai_only" || verification.verificationMode === "dual_reviewer"
      ? verification.verificationMode
      : currentVerification.verificationMode;
  const adjudicatedAt =
    verification.piFinalDecision && verification.piFinalDecision !== "pending" && verification.piName
      ? new Date().toISOString()
      : verification.piFinalDecision === "pending"
        ? null
        : data.records[index].verification.piAdjudicatedAt;
  const reviewerReviewSkippedAt =
    nextVerificationMode === "ai_only"
      ? currentVerification.reviewerReviewSkippedAt ?? new Date().toISOString()
      : null;

  data.records[index] = {
    ...data.records[index],
    verification: normalizeVerification({
      ...data.records[index].verification,
      ...verification,
      verificationMode: nextVerificationMode,
      piAdjudicatedAt: adjudicatedAt,
      reviewerReviewSkippedAt,
      reviewerReviewSkipReason:
        nextVerificationMode === "ai_only" ? verification.reviewerReviewSkipReason ?? currentVerification.reviewerReviewSkipReason : "",
      updatedAt: new Date().toISOString(),
    }),
  };
  data.reviewerSettings = {
    ...mergeReviewerSettings(data.reviewerSettings, data.records[index].verification),
    updatedAt: new Date().toISOString(),
  };
  await writeHistoryData(data, scope);
  return data.records[index];
}

export async function updateMetaFullTextExtractionReview(
  id: string,
  review: Partial<MetaFullTextExtractionReview>,
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  const index = data.records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  data.records[index] = {
    ...data.records[index],
    extractionReview: normalizeExtractionReview({
      ...data.records[index].extractionReview,
      ...review,
      updatedAt: new Date().toISOString(),
      verifiedAt:
        review.verified === true
          ? new Date().toISOString()
          : review.verified === false
            ? null
            : data.records[index].extractionReview.verifiedAt,
    }),
  };
  await writeHistoryData(data, scope);
  return data.records[index];
}

export async function replaceMetaFullTextHistoryAnalysis(
  id: string,
  analysis: MetaFullTextAnalysis,
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  const index = data.records.findIndex((record) => record.id === id);
  if (index < 0) return null;
  const current = data.records[index];

  data.records[index] = {
    ...current,
    analysis,
    analysisArchive: [
      {
        archivedAt: new Date().toISOString(),
        analysis: current.analysis,
      },
      ...(current.analysisArchive ?? []),
    ].slice(0, 10),
  };
  await writeHistoryData(data, scope);
  return data.records[index];
}

export async function updateMetaFullTextSourceFile(
  id: string,
  sourceFile: MetaFullTextSourceFile,
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  const index = data.records.findIndex((record) => record.id === id);
  if (index < 0) return null;
  const normalizedSourceFile = normalizeMetaFullTextSourceFile(sourceFile);
  if (!normalizedSourceFile) return null;

  data.records[index] = {
    ...data.records[index],
    fileName: data.records[index].fileName || normalizedSourceFile.fileName,
    sourceFile: normalizedSourceFile,
    analysis: {
      ...data.records[index].analysis,
      sourceFileSha256: normalizedSourceFile.sha256 || data.records[index].analysis.sourceFileSha256,
    },
  };
  await writeHistoryData(data, scope);
  return data.records[index];
}

export async function updateMetaFullTextReviewerSettings(
  settings: Partial<MetaFullTextReviewerSettings>,
  scope: MetaFullTextHistoryScope = {},
) {
  const data = await readHistoryData(scope);
  data.reviewerSettings = {
    ...mergeReviewerSettings(data.reviewerSettings, settings),
    updatedAt: new Date().toISOString(),
  };
  data.records = data.records.map((record) => {
    const reviewerOneName = record.verification.reviewerOneName || data.reviewerSettings.reviewerOneName;
    const reviewerTwoName = record.verification.reviewerTwoName || data.reviewerSettings.reviewerTwoName;
    if (
      reviewerOneName === record.verification.reviewerOneName &&
      reviewerTwoName === record.verification.reviewerTwoName
    ) {
      return record;
    }
    return {
      ...record,
      verification: normalizeVerification({
        ...record.verification,
        reviewerOneName,
        reviewerTwoName,
      }),
    };
  });
  await writeHistoryData(data, scope);
  return data.reviewerSettings;
}

export function metaFullTextHistoryStorageErrorDetails(error: unknown) {
  if (error instanceof MetaFullTextHistoryStorageError) return error.details;
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function toSummary(record: MetaFullTextHistoryRecord): MetaFullTextHistorySummary {
  const modelReviews = Array.isArray(record.analysis.modelReviews) ? record.analysis.modelReviews : [];
  const modelReviewLabels = Array.from(
    new Set(modelReviews.map((review) => cleanString(review.label || review.reviewerId)).filter(Boolean)),
  ).slice(0, 3);
  const modelReviewModels = Array.from(
    new Set(modelReviews.map((review) => cleanString(review.modelName)).filter(Boolean)),
  ).slice(0, 3);

  return {
    id: record.id,
    fileName: record.fileName,
    sourceSheet: record.sourceSheet,
    sourceLabel: record.sourceLabel,
    reviewMode: record.reviewMode,
    savedAt: record.savedAt,
    analyzedAt: record.analysis.analyzedAt,
    titleGuess: record.analysis.titleGuess,
    decision: record.analysis.eligibility.decision,
    confidence: record.analysis.eligibility.confidence,
    aiUsed: record.analysis.aiUsed,
    model: record.analysis.model,
    aiWarning: record.analysis.aiWarning,
    modelReviewCount: modelReviews.length,
    aiModelReviewCount: modelReviews.filter((review) => review.aiUsed).length,
    modelReviewLabels,
    modelReviewModels,
    reviewScore: record.analysis.reviewEvaluation.score,
    reviewGrade: record.analysis.reviewEvaluation.grade,
    extractionRowCount: record.analysis.extraction.rows.length,
    missingCriticalFieldCount: record.analysis.extraction.missingCriticalFields.length,
    validationIssueCount: record.analysis.extraction.validationIssues.length,
    sourceFileSaved: Boolean(record.sourceFile),
    sourceStorage: record.sourceFile?.storage ?? null,
    verificationComplete: isVerificationComplete(record.verification),
    verificationMode: record.verification.verificationMode,
    reviewerReviewSkippedAt: record.verification.reviewerReviewSkippedAt,
    reviewerOneName: record.verification.reviewerOneName,
    reviewerTwoName: record.verification.reviewerTwoName,
    reviewerOneDecision: record.verification.reviewerOneDecision,
    reviewerTwoDecision: record.verification.reviewerTwoDecision,
    fixedExclusionReason: record.verification.fixedExclusionReason,
    conflictStatus: record.verification.conflictStatus,
    piName: record.verification.piName,
    piFinalDecision: record.verification.piFinalDecision,
    piAdjudicatedAt: record.verification.piAdjudicatedAt,
  };
}

export function summarizeMetaFullTextHistoryRecord(record: MetaFullTextHistoryRecord): MetaFullTextHistorySummary {
  return toSummary(record);
}

function emptyReviewerSettings(): MetaFullTextReviewerSettings {
  return {
    reviewerOneName: "",
    reviewerTwoName: "",
    updatedAt: null,
  };
}

function emptyVerification(settings: MetaFullTextReviewerSettings = emptyReviewerSettings()): MetaFullTextVerification {
  return {
    verificationMode: "dual_reviewer",
    reviewerOneName: settings.reviewerOneName,
    reviewerTwoName: settings.reviewerTwoName,
    reviewerOneDecision: "pending",
    reviewerTwoDecision: "pending",
    fixedExclusionReason: "해당 없음",
    conflictStatus: "needs human verification",
    reviewerNotes: "",
    reviewerReviewSkippedAt: null,
    reviewerReviewSkipReason: "",
    piName: "",
    piFinalDecision: "pending",
    piFinalReason: "",
    piAdjudicatedAt: null,
    updatedAt: null,
  };
}

function emptyExtractionReview(): MetaFullTextExtractionReview {
  return {
    rows: [],
    verified: false,
    verificationNotes: "",
    verifiedBy: "",
    updatedAt: null,
    verifiedAt: null,
  };
}

function normalizeVerification(value: Partial<MetaFullTextVerification>): MetaFullTextVerification {
  const fallback = emptyVerification();
  return {
    verificationMode: value.verificationMode === "ai_only" ? "ai_only" : "dual_reviewer",
    reviewerOneName: cleanString(value.reviewerOneName) || fallback.reviewerOneName,
    reviewerTwoName: cleanString(value.reviewerTwoName) || fallback.reviewerTwoName,
    reviewerOneDecision: cleanString(value.reviewerOneDecision) || fallback.reviewerOneDecision,
    reviewerTwoDecision: cleanString(value.reviewerTwoDecision) || fallback.reviewerTwoDecision,
    fixedExclusionReason: cleanString(value.fixedExclusionReason) || fallback.fixedExclusionReason,
    conflictStatus: cleanString(value.conflictStatus) || fallback.conflictStatus,
    reviewerNotes: cleanString(value.reviewerNotes),
    reviewerReviewSkippedAt: cleanOptional(value.reviewerReviewSkippedAt),
    reviewerReviewSkipReason: cleanString(value.reviewerReviewSkipReason),
    piName: cleanString(value.piName),
    piFinalDecision: cleanString(value.piFinalDecision) || fallback.piFinalDecision,
    piFinalReason: cleanString(value.piFinalReason),
    piAdjudicatedAt: cleanOptional(value.piAdjudicatedAt),
    updatedAt: cleanOptional(value.updatedAt),
  };
}

function normalizeExtractionReview(value: Partial<MetaFullTextExtractionReview> | null | undefined): MetaFullTextExtractionReview {
  const fallback = emptyExtractionReview();
  const rows = Array.isArray(value?.rows)
    ? value.rows.map((row) => normalizeRow(row)).filter((row) => Object.keys(row).length > 0)
    : fallback.rows;
  return {
    rows,
    verified: Boolean(value?.verified),
    verificationNotes: cleanString(value?.verificationNotes),
    verifiedBy: cleanString(value?.verifiedBy),
    updatedAt: cleanOptional(value?.updatedAt),
    verifiedAt: cleanOptional(value?.verifiedAt),
  };
}

function normalizeRow(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, cell]) => [key, cleanString(cell)]),
  );
}

function mergeReviewerSettings(
  current: MetaFullTextReviewerSettings = emptyReviewerSettings(),
  next: {
    reviewerOneName?: string | null;
    reviewerTwoName?: string | null;
    updatedAt?: string | null;
  } = {},
): MetaFullTextReviewerSettings {
  return {
    reviewerOneName: cleanString(next.reviewerOneName) || current.reviewerOneName || "",
    reviewerTwoName: cleanString(next.reviewerTwoName) || current.reviewerTwoName || "",
    updatedAt: cleanOptional(next.updatedAt) ?? current.updatedAt ?? null,
  };
}

function normalizeReviewerSettings(value: unknown): MetaFullTextReviewerSettings {
  if (!value || typeof value !== "object") return emptyReviewerSettings();
  return mergeReviewerSettings(emptyReviewerSettings(), value as Partial<MetaFullTextReviewerSettings>);
}

function isVerificationComplete(verification: MetaFullTextVerification) {
  if (verification.verificationMode === "ai_only") {
    return (
      verification.piFinalDecision !== "pending" &&
      Boolean(verification.piName.trim()) &&
      Boolean(verification.piAdjudicatedAt)
    );
  }

  return (
    Boolean(verification.reviewerOneName.trim()) &&
    Boolean(verification.reviewerTwoName.trim()) &&
    verification.reviewerOneDecision !== "pending" &&
    verification.reviewerTwoDecision !== "pending" &&
    ["agreement", "resolved"].includes(verification.conflictStatus) &&
    verification.piFinalDecision !== "pending" &&
    Boolean(verification.piName.trim()) &&
    Boolean(verification.piAdjudicatedAt)
  );
}

function historyStats(records: MetaFullTextHistoryRecord[]): MetaFullTextHistoryStats {
  return {
    totalCount: records.length,
    verificationCompletedCount: records.filter((record) => isVerificationComplete(record.verification)).length,
  };
}

function normalizeRecord(value: unknown): MetaFullTextHistoryRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<MetaFullTextHistoryRecord>;
  if (!record.analysis || typeof record.analysis !== "object") return null;
  const id = cleanString(record.id) || crypto.randomUUID();
  const analysis = normalizeStoredAnalysis(record.analysis as Partial<MetaFullTextAnalysis>);
  return {
    id,
    fileName: cleanString(record.fileName) || analysis.fileName || "full-text",
    sourceSheet: cleanOptional(record.sourceSheet),
    sourceLabel: cleanOptional(record.sourceLabel),
    reviewMode: cleanOptional(record.reviewMode),
    referenceRecord: cleanOptional(record.referenceRecord),
    savedAt: cleanString(record.savedAt) || analysis.analyzedAt || new Date().toISOString(),
    sourceFile: normalizeMetaFullTextSourceFile(record.sourceFile),
    analysis,
    verification: normalizeVerification(record.verification ?? {}),
    extractionReview: normalizeExtractionReview(record.extractionReview),
    analysisArchive: Array.isArray(record.analysisArchive)
      ? record.analysisArchive.map(normalizeAnalysisArchiveEntry).filter(Boolean).slice(0, 10) as MetaFullTextAnalysisArchiveEntry[]
      : [],
  };
}

function normalizeAnalysisArchiveEntry(value: unknown): MetaFullTextAnalysisArchiveEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<MetaFullTextAnalysisArchiveEntry>;
  if (!record.analysis || typeof record.analysis !== "object") return null;
  return {
    archivedAt: cleanString(record.archivedAt) || new Date().toISOString(),
    analysis: normalizeStoredAnalysis(record.analysis as Partial<MetaFullTextAnalysis>),
  };
}

function mergeFullTextAnalyses(current: MetaFullTextAnalysis, selected: MetaFullTextAnalysis): MetaFullTextAnalysis {
  const selectedReviews = Array.isArray(selected.modelReviews) ? selected.modelReviews : [];
  const currentReviews = Array.isArray(current.modelReviews) ? current.modelReviews : [];
  const selectedHasUsableAi = selected.aiUsed && selectedReviews.some((review) => review.aiUsed);
  const mergedReviews = mergeModelReviews(currentReviews, selectedReviews);

  if (!selectedHasUsableAi) {
    return normalizeStoredAnalysis({
      ...current,
      analyzedAt: new Date().toISOString(),
      aiWarning: selected.aiWarning ?? current.aiWarning,
      modelReviews: mergedReviews,
      extraction: {
        ...current.extraction,
        validationIssues: Array.from(
          new Set([
            ...current.extraction.validationIssues,
            ...selected.extraction.validationIssues,
          ].filter(Boolean)),
        ),
      },
    });
  }

  return normalizeStoredAnalysis({
    ...selected,
    analyzedAt: new Date().toISOString(),
    aiWarning: selected.aiWarning ?? current.aiWarning,
    modelReviews: mergedReviews,
    nextActions: Array.from(new Set([...selected.nextActions, ...current.nextActions].filter(Boolean))).slice(0, 8),
    extraction: {
      ...selected.extraction,
      validationIssues: Array.from(
        new Set([
          ...selected.extraction.validationIssues,
          ...current.extraction.validationIssues,
        ].filter(Boolean)),
      ),
    },
  });
}

function mergeModelReviews(
  current: MetaFullTextAnalysis["modelReviews"],
  selected: MetaFullTextAnalysis["modelReviews"],
) {
  const mergedReviews: MetaFullTextAnalysis["modelReviews"] = [];
  const reviewById = new Map<string, MetaFullTextAnalysis["modelReviews"][number]>();
  for (const review of current) reviewById.set(review.reviewerId, review);
  for (const review of selected) reviewById.set(review.reviewerId, review);
  const preferredOrder = [...current, ...selected].map((review) => review.reviewerId);
  for (const reviewerId of preferredOrder) {
    const review = reviewById.get(reviewerId);
    if (review && !mergedReviews.some((item) => item.reviewerId === reviewerId)) mergedReviews.push(review);
  }
  return mergedReviews;
}

function duplicateTextKey(value: string) {
  const withoutExtension = value.replace(/\.[a-z0-9]{1,8}$/i, "");
  return withoutExtension
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\uAC00-\uD7A3]+/g, "")
    .trim()
    .slice(0, 180);
}

function normalizeStoredAnalysis(analysis: Partial<MetaFullTextAnalysis>): MetaFullTextAnalysis {
  return {
    ...(analysis as MetaFullTextAnalysis),
    analysisSchemaVersion: cleanString(analysis.analysisSchemaVersion) || "legacy",
    sourceFileSha256: cleanString(analysis.sourceFileSha256),
    modelReviews: Array.isArray(analysis.modelReviews) ? analysis.modelReviews : [],
  };
}

function normalizeData(value: unknown): MetaFullTextHistoryData {
  const records =
    value && typeof value === "object" && Array.isArray((value as Partial<MetaFullTextHistoryData>).records)
      ? ((value as Partial<MetaFullTextHistoryData>).records ?? [])
      : [];
  return {
    records: records.map(normalizeRecord).filter(Boolean).slice(0, maxStoredRecords) as MetaFullTextHistoryRecord[],
    reviewerSettings: normalizeReviewerSettings((value as Partial<MetaFullTextHistoryData> | null)?.reviewerSettings),
  };
}

async function readHistoryData(scope: MetaFullTextHistoryScope = {}): Promise<MetaFullTextHistoryData> {
  const targetPath = storageLocation(scope);
  let raw: string | null;

  try {
    raw = await readStorageText(scope);
  } catch (error) {
    throw storageError(error, "read", targetPath);
  }

  if (!raw) return { records: [], reviewerSettings: emptyReviewerSettings() };

  try {
    return normalizeData(JSON.parse(raw));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw storageError(error, "read", targetPath);
    await backupCorruptHistory(raw, error, scope);
    return { records: [], reviewerSettings: emptyReviewerSettings() };
  }
}

async function writeHistoryData(data: MetaFullTextHistoryData, scope: MetaFullTextHistoryScope = {}) {
  const targetPath = storageLocation(scope);
  try {
    await writeStorageText(JSON.stringify(normalizeData(data), null, 2), scope);
  } catch (error) {
    throw storageError(error, "write", targetPath);
  }
}

async function readStorageText(scope: MetaFullTextHistoryScope = {}) {
  if (storageBackend() === "google-drive") {
    ensureGoogleDriveStorageConfigured("read", scope);
    const raw = await readTextFileFromGoogleDrive(driveFileName(scope), driveFileId(scope));
    if (raw || !shouldReadLegacyHistoryFallback(scope)) return raw;
    return readTextFileFromGoogleDrive(driveFileName(), driveFileId());
  }

  try {
    return await fs.readFile(/* turbopackIgnore: true */ localStoragePath(scope), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (!shouldReadLegacyHistoryFallback(scope)) return null;
      try {
        return await fs.readFile(/* turbopackIgnore: true */ localStoragePath(), "utf8");
      } catch (fallbackError) {
        if ((fallbackError as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw fallbackError;
      }
    }
    throw error;
  }
}

async function writeStorageText(contents: string, scope: MetaFullTextHistoryScope = {}) {
  if (storageBackend() === "google-drive") {
    ensureGoogleDriveStorageConfigured("write", scope);
    await writeTextFileToGoogleDrive(driveFileName(scope), contents, driveFileId(scope));
    return;
  }

  const targetPath = localStoragePath(scope);
  if (isServerlessRuntime()) {
    throw new MetaFullTextHistoryStorageError("meta full-text history storage write failed.", {
      operation: "write",
      path: targetPath,
      backend: "local-json",
      code: "SERVERLESS_LOCAL_STORAGE",
      message:
        "The deployment filesystem is read-only, so full-text analysis history cannot be saved as a local JSON file.",
      help:
        "For Vercel, set META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive or REPORT_STORAGE_BACKEND=google-drive with Google Drive credentials. For Synology/local Docker, use local-json with a writable .data volume.",
    });
  }

  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(temporaryPath, contents, "utf8");
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function backupCorruptHistory(raw: string, parseError: SyntaxError, scope: MetaFullTextHistoryScope = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (storageBackend() === "google-drive") {
    const backupName = `${driveFileName(scope)}.corrupt-${stamp}`;
    try {
      await writeTextFileToGoogleDrive(backupName, raw);
      return;
    } catch (error) {
      throw storageError(error, "backup-corrupt-json", storageLocation(scope), `google-drive:${backupName}`, parseError.message);
    }
  }

  const targetPath = localStoragePath(scope);
  const backupPath = `${targetPath}.corrupt-${stamp}`;
  try {
    await fs.rename(targetPath, backupPath);
  } catch (error) {
    throw storageError(error, "backup-corrupt-json", targetPath, backupPath, parseError.message);
  }
}

function storageBackend(): "local-json" | "google-drive" {
  return resolveMetaJsonStorageBackend({
    configured: process.env.META_FULL_TEXT_HISTORY_STORAGE_BACKEND,
    inherited: process.env.META_PROJECT_STORAGE_BACKEND,
  });
}

function localStoragePath(scope: MetaFullTextHistoryScope = {}) {
  const projectId = scopeProjectId(scope);
  if (projectId) return metaProjectScopedLocalPath(projectId, "full-text-history.json");

  const configured = process.env.META_FULL_TEXT_HISTORY_STORAGE_PATH?.trim();
  return configured || defaultStoragePath;
}

function driveFileName(scope: MetaFullTextHistoryScope = {}) {
  const projectId = scopeProjectId(scope);
  if (projectId) return metaProjectScopedDriveFileName(projectId, "full-text-history.json");

  return (
    process.env.META_FULL_TEXT_HISTORY_DRIVE_FILENAME?.trim() ||
    baseName(process.env.META_FULL_TEXT_HISTORY_STORAGE_PATH?.trim() || defaultStoragePath)
  );
}

function driveFileId(scope: MetaFullTextHistoryScope = {}) {
  if (scopeProjectId(scope)) return "";
  return process.env.META_FULL_TEXT_HISTORY_DRIVE_FILE_ID?.trim() ?? "";
}

function storageLocation(scope: MetaFullTextHistoryScope = {}) {
  return storageBackend() === "google-drive" ? `google-drive:${driveFileName(scope)}` : localStoragePath(scope);
}

function ensureGoogleDriveStorageConfigured(
  operation: MetaFullTextHistoryStorageErrorDetails["operation"],
  scope: MetaFullTextHistoryScope = {},
) {
  if (getGoogleDriveAuthMode()) return;
  throw new MetaFullTextHistoryStorageError(`meta full-text history storage ${operation} failed.`, {
    operation,
    path: `google-drive:${driveFileName(scope)}`,
    backend: "google-drive",
    code: "GOOGLE_DRIVE_NOT_CONFIGURED",
    message:
      "Full-text history storage is set to google-drive, but Google Drive credentials are incomplete.",
    help:
      "Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN, or configure service-account storage with GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID.",
  });
}

function storageError(
  error: unknown,
  operation: MetaFullTextHistoryStorageErrorDetails["operation"],
  targetPath: string,
  backupPath?: string,
  cause?: string,
) {
  if (error instanceof MetaFullTextHistoryStorageError) return error;
  const nodeError = error as NodeJS.ErrnoException;
  const message = error instanceof Error ? error.message : String(error);
  const backend = targetPath.startsWith("google-drive:") ? "google-drive" : "local-json";
  const help =
    backend === "google-drive"
      ? "Check Google Drive credentials and write permission. On Vercel, redeploy after changing environment variables."
      : "Check that the runtime user can write to the configured full-text history storage path.";

  return new MetaFullTextHistoryStorageError(`meta full-text history storage ${operation} failed.`, {
    operation,
    path: targetPath,
    backend,
    code: nodeError.code,
    message: cause ? `${message}; cause: ${cause}` : message,
    help,
    backupPath,
  });
}

function historyScope(input: MetaFullTextHistoryScope): MetaFullTextHistoryScope {
  const projectId = scopeProjectId(input);
  return projectId ? { projectId } : {};
}

function scopeProjectId(scope: MetaFullTextHistoryScope = {}) {
  return cleanMetaProjectId(scope.projectId);
}

function shouldReadLegacyHistoryFallback(scope: MetaFullTextHistoryScope = {}) {
  const projectId = scopeProjectId(scope);
  const legacyProjectId = process.env.META_FULL_TEXT_HISTORY_LEGACY_PROJECT_ID?.trim() || defaultLegacyProjectId;
  return Boolean(projectId && projectId === legacyProjectId);
}

function baseName(value: string) {
  return value.split(/[\\/]+/).filter(Boolean).at(-1) || value;
}


function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned || null;
}
