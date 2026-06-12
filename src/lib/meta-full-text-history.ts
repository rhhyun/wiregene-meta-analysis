import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";
import type { MetaFullTextAnalysis } from "./meta-full-text-analysis";

export type MetaFullTextVerification = {
  reviewerOneDecision: string;
  reviewerTwoDecision: string;
  fixedExclusionReason: string;
  conflictStatus: string;
  reviewerNotes: string;
  updatedAt: string | null;
};

export type MetaFullTextHistoryRecord = {
  id: string;
  fileName: string;
  sourceSheet: string | null;
  sourceLabel: string | null;
  reviewMode: string | null;
  referenceRecord: string | null;
  savedAt: string;
  analysis: MetaFullTextAnalysis;
  verification: MetaFullTextVerification;
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
  reviewScore: number;
  reviewGrade: string;
  extractionRowCount: number;
  missingCriticalFieldCount: number;
  validationIssueCount: number;
};

type MetaFullTextHistoryData = {
  records: MetaFullTextHistoryRecord[];
};

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
const maxStoredRecords = 500;

export async function saveMetaFullTextHistory(input: {
  analysis: MetaFullTextAnalysis;
  sourceSheet?: string | null;
  sourceLabel?: string | null;
  reviewMode?: string | null;
  referenceRecord?: string | null;
}) {
  const data = await readHistoryData();
  const record: MetaFullTextHistoryRecord = {
    id: `mfta_${new Date().toISOString().replace(/[-:.TZ]/g, "")}_${crypto.randomUUID().slice(0, 8)}`,
    fileName: input.analysis.fileName,
    sourceSheet: cleanOptional(input.sourceSheet),
    sourceLabel: cleanOptional(input.sourceLabel),
    reviewMode: cleanOptional(input.reviewMode),
    referenceRecord: cleanOptional(input.referenceRecord),
    savedAt: new Date().toISOString(),
    analysis: input.analysis,
    verification: emptyVerification(),
  };

  data.records = [record, ...data.records.filter((item) => item.id !== record.id)].slice(0, maxStoredRecords);
  await writeHistoryData(data);
  return record;
}

export async function listMetaFullTextHistory(limit = 50) {
  const data = await readHistoryData();
  return data.records
    .slice()
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, Math.max(1, Math.min(limit, maxStoredRecords)))
    .map(toSummary);
}

export async function getMetaFullTextHistoryRecord(id: string) {
  const data = await readHistoryData();
  return data.records.find((record) => record.id === id) ?? null;
}

export async function updateMetaFullTextVerification(id: string, verification: Partial<MetaFullTextVerification>) {
  const data = await readHistoryData();
  const index = data.records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  data.records[index] = {
    ...data.records[index],
    verification: {
      ...data.records[index].verification,
      ...normalizeVerification(verification),
      updatedAt: new Date().toISOString(),
    },
  };
  await writeHistoryData(data);
  return data.records[index];
}

export function metaFullTextHistoryStorageErrorDetails(error: unknown) {
  if (error instanceof MetaFullTextHistoryStorageError) return error.details;
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function toSummary(record: MetaFullTextHistoryRecord): MetaFullTextHistorySummary {
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
    reviewScore: record.analysis.reviewEvaluation.score,
    reviewGrade: record.analysis.reviewEvaluation.grade,
    extractionRowCount: record.analysis.extraction.rows.length,
    missingCriticalFieldCount: record.analysis.extraction.missingCriticalFields.length,
    validationIssueCount: record.analysis.extraction.validationIssues.length,
  };
}

function emptyVerification(): MetaFullTextVerification {
  return {
    reviewerOneDecision: "pending",
    reviewerTwoDecision: "pending",
    fixedExclusionReason: "해당 없음",
    conflictStatus: "needs human verification",
    reviewerNotes: "",
    updatedAt: null,
  };
}

function normalizeVerification(value: Partial<MetaFullTextVerification>): MetaFullTextVerification {
  const fallback = emptyVerification();
  return {
    reviewerOneDecision: cleanString(value.reviewerOneDecision) || fallback.reviewerOneDecision,
    reviewerTwoDecision: cleanString(value.reviewerTwoDecision) || fallback.reviewerTwoDecision,
    fixedExclusionReason: cleanString(value.fixedExclusionReason) || fallback.fixedExclusionReason,
    conflictStatus: cleanString(value.conflictStatus) || fallback.conflictStatus,
    reviewerNotes: cleanString(value.reviewerNotes),
    updatedAt: cleanOptional(value.updatedAt),
  };
}

function normalizeRecord(value: unknown): MetaFullTextHistoryRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<MetaFullTextHistoryRecord>;
  if (!record.analysis || typeof record.analysis !== "object") return null;
  const id = cleanString(record.id) || crypto.randomUUID();
  const analysis = record.analysis as MetaFullTextAnalysis;
  return {
    id,
    fileName: cleanString(record.fileName) || analysis.fileName || "full-text",
    sourceSheet: cleanOptional(record.sourceSheet),
    sourceLabel: cleanOptional(record.sourceLabel),
    reviewMode: cleanOptional(record.reviewMode),
    referenceRecord: cleanOptional(record.referenceRecord),
    savedAt: cleanString(record.savedAt) || analysis.analyzedAt || new Date().toISOString(),
    analysis,
    verification: normalizeVerification(record.verification ?? {}),
  };
}

function normalizeData(value: unknown): MetaFullTextHistoryData {
  const records =
    value && typeof value === "object" && Array.isArray((value as Partial<MetaFullTextHistoryData>).records)
      ? ((value as Partial<MetaFullTextHistoryData>).records ?? [])
      : [];
  return {
    records: records.map(normalizeRecord).filter(Boolean).slice(0, maxStoredRecords) as MetaFullTextHistoryRecord[],
  };
}

async function readHistoryData(): Promise<MetaFullTextHistoryData> {
  const targetPath = storageLocation();
  let raw: string | null;

  try {
    raw = await readStorageText();
  } catch (error) {
    throw storageError(error, "read", targetPath);
  }

  if (!raw) return { records: [] };

  try {
    return normalizeData(JSON.parse(raw));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw storageError(error, "read", targetPath);
    await backupCorruptHistory(raw, error);
    return { records: [] };
  }
}

async function writeHistoryData(data: MetaFullTextHistoryData) {
  const targetPath = storageLocation();
  try {
    await writeStorageText(JSON.stringify(normalizeData(data), null, 2));
  } catch (error) {
    throw storageError(error, "write", targetPath);
  }
}

async function readStorageText() {
  if (storageBackend() === "google-drive") {
    ensureGoogleDriveStorageConfigured("read");
    return readTextFileFromGoogleDrive(driveFileName(), driveFileId());
  }

  try {
    return await fs.readFile(localStoragePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeStorageText(contents: string) {
  if (storageBackend() === "google-drive") {
    ensureGoogleDriveStorageConfigured("write");
    await writeTextFileToGoogleDrive(driveFileName(), contents, driveFileId());
    return;
  }

  const targetPath = localStoragePath();
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

async function backupCorruptHistory(raw: string, parseError: SyntaxError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (storageBackend() === "google-drive") {
    const backupName = `${driveFileName()}.corrupt-${stamp}`;
    try {
      await writeTextFileToGoogleDrive(backupName, raw);
      return;
    } catch (error) {
      throw storageError(error, "backup-corrupt-json", storageLocation(), `google-drive:${backupName}`, parseError.message);
    }
  }

  const targetPath = localStoragePath();
  const backupPath = `${targetPath}.corrupt-${stamp}`;
  try {
    await fs.rename(targetPath, backupPath);
  } catch (error) {
    throw storageError(error, "backup-corrupt-json", targetPath, backupPath, parseError.message);
  }
}

function storageBackend(): "local-json" | "google-drive" {
  const configured = process.env.META_FULL_TEXT_HISTORY_STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === "local-json" || configured === "google-drive") return configured;
  const inherited = (process.env.REPORT_STORAGE_BACKEND ?? process.env.GRANT_STORAGE_BACKEND ?? "").trim().toLowerCase();
  if (inherited === "local-json" || inherited === "google-drive") return inherited;
  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return "local-json";
}

function localStoragePath() {
  const configured = process.env.META_FULL_TEXT_HISTORY_STORAGE_PATH?.trim();
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || defaultStoragePath);
}

function driveFileName() {
  return (
    process.env.META_FULL_TEXT_HISTORY_DRIVE_FILENAME?.trim() ||
    path.basename(process.env.META_FULL_TEXT_HISTORY_STORAGE_PATH?.trim() || defaultStoragePath)
  );
}

function driveFileId() {
  return process.env.META_FULL_TEXT_HISTORY_DRIVE_FILE_ID?.trim() ?? "";
}

function storageLocation() {
  return storageBackend() === "google-drive" ? `google-drive:${driveFileName()}` : localStoragePath();
}

function ensureGoogleDriveStorageConfigured(operation: MetaFullTextHistoryStorageErrorDetails["operation"]) {
  if (getGoogleDriveAuthMode()) return;
  throw new MetaFullTextHistoryStorageError(`meta full-text history storage ${operation} failed.`, {
    operation,
    path: `google-drive:${driveFileName()}`,
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

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value: unknown) {
  const cleaned = cleanString(value);
  return cleaned || null;
}
