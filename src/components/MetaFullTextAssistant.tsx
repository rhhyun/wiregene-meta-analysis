"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  Save,
  SearchCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";
import type { MetaFullTextAnalysis } from "@/lib/meta-full-text-analysis";
import {
  defaultMetaFullTextResearcherGuidance,
  musicianPrmdRiskOfBiasGuidance,
  normalizeMetaFullTextResearcherGuidance,
} from "@/lib/meta-full-text-prompt-guidance";

type MetaFullTextAssistantProps = {
  extractionColumns: string[];
  focus: "screening" | "extraction";
  projectId: string;
  worksheetOptions?: {
    sheetName: string;
    label: string;
    reviewMode: "standard" | "cautious" | "not_required";
  }[];
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

type ReviewerDecision = "pending" | "include_quantitative" | "include_narrative_support" | "exclude" | "conflict";
type PiFinalDecision = "pending" | "include_quantitative" | "include_narrative_support" | "exclude";
type HistoryFilter =
  | "all"
  | "legacy_source"
  | "primary_quantitative_included"
  | "verification_pending"
  | "verification_complete"
  | MetaFullTextAnalysis["eligibility"]["decision"];
type HistorySortKey = "number" | "title" | "first_author";
type HistorySortDirection = "asc" | "desc";

type MetaFullTextHistorySummary = {
  id: string;
  fileName: string;
  sourceSheet: string | null;
  sourceLabel: string | null;
  reviewMode: string | null;
  savedAt: string;
  analyzedAt: string;
  titleGuess: string | null;
  displayTitle: string | null;
  firstAuthor: string | null;
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
  sourceStorage: string | null;
  verificationComplete: boolean;
  verificationMode: "dual_reviewer" | "ai_only";
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

type MetaFullTextVerification = {
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

type MetaFullTextReviewerSettings = {
  reviewerOneName: string;
  reviewerTwoName: string;
  updatedAt: string | null;
};

type MetaFullTextHistoryStats = {
  totalCount: number;
  verificationCompletedCount: number;
};

type MetaFullTextHistoryOverviewPayload = {
  records: MetaFullTextHistorySummary[];
  reviewerSettings?: MetaFullTextReviewerSettings;
  stats?: MetaFullTextHistoryStats;
};

type CachedMetaFullTextHistoryOverview = MetaFullTextHistoryOverviewPayload & {
  cachedAt: string;
};

type MetaAiReviewerSlotSummary = {
  id: string;
  label: string;
  providerType: "OPENAI" | "OPENAI_COMPATIBLE";
  enabled: boolean;
  modelName: string;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
};

type MetaFullTextHistoryRecord = {
  id: string;
  fileName: string;
  sourceSheet: string | null;
  sourceLabel: string | null;
  reviewMode: string | null;
  referenceRecord: string | null;
  savedAt: string;
  sourceFile: {
    storage: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    sha256: string;
    savedAt: string;
    localPath: string | null;
    driveFileId: string | null;
    webViewLink: string | null;
  } | null;
  analysis: MetaFullTextAnalysis;
  verification: MetaFullTextVerification;
};

type BatchAnalysisStatus = "pending" | "analyzing" | "saved" | "analyzed_not_saved" | "failed";

type BatchFileMatch = {
  targetId: string;
  targetFileName: string;
  targetTitleGuess: string | null;
  sourceFileSaved: boolean;
  aiModelReviewCount: number;
  score: number;
  reason: string;
};

type BatchAnalysisResult = {
  id: string;
  fileName: string;
  fileSize: number;
  status: BatchAnalysisStatus;
  attempts: number;
  savedRecordId: string | null;
  decision: MetaFullTextAnalysis["eligibility"]["decision"] | null;
  confidence: number | null;
  message: string;
  match: BatchFileMatch | null;
  savedSourceRerun?: boolean;
};

const largeFileUploadThresholdBytes = 4 * 1024 * 1024;
const googleDriveResumableChunkUnitBytes = 256 * 1024;
const largeFileUploadChunkBytes = googleDriveResumableChunkUnitBytes * 9;
const fullTextAnalysisRequestTimeoutMs = 330_000;
const fullTextReanalysisRequestTimeoutMs = 330_000;
const fullTextUploadSessionTimeoutMs = 60_000;
const fullTextChunkUploadTimeoutMs = 120_000;
const batchAnalysisMaxAttempts = 3;
const longRequestMaxAttempts = 3;
const chunkUploadMaxAttempts = 4;

type ApiPayload = Record<string, unknown>;

type AnalysisPayload = {
  analysis: MetaFullTextAnalysis;
  savedRecord?: MetaFullTextHistorySummary | null;
  saveError?: unknown;
  duplicateAction?: {
    status: "merged" | "saved_new" | "merge_target_not_found_saved_new" | "merge_target_not_found_skipped_new";
    targetId?: string;
    matchedBy?: string;
  };
  diagnostics?: unknown;
};

type DirectUploadSessionPayload = {
  uploadUrl: string;
  requestId: string;
  storage: "google-drive";
};

type GoogleDriveUploadPayload = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string | number;
};

type ChunkUploadPayload = {
  complete?: boolean;
  file?: GoogleDriveUploadPayload;
  receivedRange?: string | null;
  requestId?: string;
};

function fullTextHistoryListUrl(projectId: string) {
  const searchParams = new URLSearchParams({ limit: "500" });
  if (projectId.trim()) searchParams.set("projectId", projectId.trim());
  return `/api/meta-analysis/full-text/history?${searchParams.toString()}`;
}

function fullTextHistoryCacheKey(projectId: string) {
  return `wiregene-meta-full-text-history-overview:${projectId.trim() || "default"}`;
}

function aiGuidanceCacheKey(projectId: string) {
  return `wiregene-meta-full-text-ai-guidance:${projectId.trim() || "default"}`;
}

function readCachedFullTextHistoryOverview(projectId: string): CachedMetaFullTextHistoryOverview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(fullTextHistoryCacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedMetaFullTextHistoryOverview>;
    if (!Array.isArray(parsed.records) || typeof parsed.cachedAt !== "string") return null;
    return {
      records: parsed.records,
      reviewerSettings: parsed.reviewerSettings,
      stats: parsed.stats,
      cachedAt: parsed.cachedAt,
    };
  } catch {
    return null;
  }
}

function writeCachedFullTextHistoryOverview(projectId: string, payload: MetaFullTextHistoryOverviewPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      fullTextHistoryCacheKey(projectId),
      JSON.stringify({
        records: payload.records,
        reviewerSettings: payload.reviewerSettings,
        stats: payload.stats,
        cachedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // The server-side history remains authoritative; browser cache is only a protective display copy.
  }
}

function fullTextHistoryUnavailableMessage(message: string) {
  return `${message} Existing full-text analysis records are not deleted; they are temporarily unavailable because shared storage could not be read. Reconnect Google Drive or use Synology/local Docker storage, then refresh.`;
}

function fullTextHistoryRecordUrl(id: string, projectId: string, action?: "reanalyze" | "source") {
  const searchParams = new URLSearchParams();
  if (projectId.trim()) searchParams.set("projectId", projectId.trim());
  const suffix = action ? `/${action}` : "";
  const query = searchParams.toString();
  return `/api/meta-analysis/full-text/history/${encodeURIComponent(id)}${suffix}${query ? `?${query}` : ""}`;
}

async function readAnalysisPayload(response: Response) {
  const { payload } = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "full-text 분석에 실패했습니다."));
  }
  return payload as AnalysisPayload;
}

async function readUploadSessionPayload(response: Response) {
  const { payload } = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Large-file upload session failed."));
  }
  if (typeof payload.uploadUrl !== "string" || !payload.uploadUrl.trim()) {
    throw new Error("Large-file upload session did not return an upload URL.");
  }
  return payload as DirectUploadSessionPayload;
}

async function readChunkUploadPayload(response: Response) {
  const { payload } = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Large-file chunk upload failed."));
  }
  return payload as ChunkUploadPayload;
}

async function readResponsePayload(response: Response): Promise<{ payload: ApiPayload; rawText: string; isJson: boolean }> {
  const rawText = await response.text().catch(() => "");
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("json");
  if (rawText.trim() && isJson) {
    try {
      return { payload: JSON.parse(rawText) as ApiPayload, rawText, isJson };
    } catch {
      // Fall through to the safe non-JSON diagnostic payload.
    }
  }

  return {
    payload: response.ok
      ? {}
      : {
          error: `Request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
          details: {
            httpStatus: response.status,
            contentType,
            raw: shortenErrorText(rawText),
            help:
              response.status === 413 || /FUNCTION_PAYLOAD_TOO_LARGE|body size|payload/i.test(rawText)
                ? "The file did not reach the analyzer route because the platform rejected the upload body. Large files must use the Meta server chunk upload path or Synology/local Docker."
                : "The server returned a non-JSON error response. Check this raw response and the deployment logs.",
          },
        },
    rawText,
    isJson: false,
  };
}

function retryableHttpStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryDelayFromResponse(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 120_000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(0, retryAt - Date.now()), 120_000);
  }
  const delays = [5_000, 15_000, 45_000, 90_000];
  return delays[Math.min(attempt - 1, delays.length - 1)];
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatSeconds(ms: number) {
  return `${Math.ceil(ms / 1000).toLocaleString("ko-KR")}s`;
}

async function fetchWithTimeoutAndRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  options: {
    label: string;
    timeoutMs: number;
    attempts: number;
    onRetry?: (message: string) => void;
  },
) {
  let lastError: unknown = null;
  const attempts = Math.max(1, options.attempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (!retryableHttpStatus(response.status) || attempt >= attempts) {
        return response;
      }

      const waitMs = retryDelayFromResponse(response, attempt);
      options.onRetry?.(
        `${options.label} returned HTTP ${response.status}; retrying ${attempt + 1}/${attempts} after ${formatSeconds(waitMs)}.`,
      );
      await delay(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        throw new Error(
          `${options.label} failed after ${attempts} attempt(s). ${
            isAbortError(error) ? `Timed out after ${formatSeconds(options.timeoutMs)}.` : errorText(error)
          }`,
        );
      }

      const waitMs = retryDelayFromResponse(null, attempt);
      options.onRetry?.(
        `${options.label} ${isAbortError(error) ? `timed out after ${formatSeconds(options.timeoutMs)}` : "failed"}; retrying ${
          attempt + 1
        }/${attempts} after ${formatSeconds(waitMs)}.`,
      );
      await delay(waitMs);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(`${options.label} failed. ${lastError ? errorText(lastError) : "No response was returned."}`);
}

function shortenErrorText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 600 ? `${normalized.slice(0, 597)}...` : normalized;
}

async function readHistoryListPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Saved full-text analyses could not be loaded."));
  }
  return payload as MetaFullTextHistoryOverviewPayload & {
    reviewerSettings: MetaFullTextReviewerSettings;
    stats: MetaFullTextHistoryStats;
    deletedRecord?: MetaFullTextHistorySummary;
    deletedRecords?: MetaFullTextHistorySummary[];
    sourceFileDeleted?: boolean;
    sourceFileDeletedCount?: number;
    sourceFileDeleteWarning?: string | null;
    sourceFileDeleteWarnings?: string[];
  };
}

async function readHistoryRecordPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Saved full-text analysis could not be loaded."));
  }
  return payload as { record: MetaFullTextHistoryRecord };
}

async function readReviewerSettingsPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Reviewer names could not be saved."));
  }
  return payload as {
    records: MetaFullTextHistorySummary[];
    reviewerSettings: MetaFullTextReviewerSettings;
    stats: MetaFullTextHistoryStats;
  };
}

async function readAiSettingsPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "AI reviewer settings could not be loaded."));
  }
  const settings = (payload as { settings?: { modelReviewers?: MetaAiReviewerSlotSummary[] } }).settings;
  return {
    reviewerSlots: Array.isArray(settings?.modelReviewers) ? settings.modelReviewers : [],
  };
}

function savedErrorMessage(details: unknown) {
  if (!details || typeof details !== "object") return "Analysis finished, but the result was not saved.";
  const record = details as Record<string, unknown>;
  return [
    "Analysis finished, but the result was not saved.",
    record.code ? `code=${record.code}` : "",
    record.message ? `message=${record.message}` : "",
    record.help ? `help=${record.help}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizedArticleFileKey(value: string) {
  return value
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\uAC00-\uD7A3]+/g, "")
    .trim()
    .slice(0, 180);
}

const articleMatchStopWords = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "full",
  "text",
  "fulltext",
  "article",
  "download",
  "main",
  "supplement",
  "supplementary",
  "ebsco",
  "elsevier",
  "sciencedirect",
  "springer",
  "wiley",
  "taylor",
  "francis",
  "sage",
  "mdpi",
  "pmc",
  "nihms",
  "s2",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "among",
  "during",
  "related",
]);

function articleMatchTokens(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .replace(/\.[a-z0-9]{1,8}$/i, "")
        .toLowerCase()
        .normalize("NFKD")
        .split(/[^a-z0-9\uAC00-\uD7A3]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token) => !/^\d{1,3}$/.test(token))
        .filter((token) => !articleMatchStopWords.has(token)),
    ),
  ).slice(0, 60);
}

function articleYears(value: string | null | undefined) {
  return new Set((value ?? "").match(/\b(19|20)\d{2}\b/g) ?? []);
}

function tokenOverlapScore(sourceTokens: string[], targetTokens: string[]) {
  if (sourceTokens.length === 0 || targetTokens.length === 0) return 0;
  const targetSet = new Set(targetTokens);
  const common = sourceTokens.filter((token) => targetSet.has(token)).length;
  if (common === 0) return 0;
  const coverage = common / Math.min(sourceTokens.length, targetTokens.length);
  const union = new Set([...sourceTokens, ...targetTokens]).size;
  const jaccard = common / Math.max(1, union);
  return coverage * 0.7 + jaccard * 0.3;
}

function yearAdjustedScore(score: number, sourceText: string, targetText: string) {
  const sourceYears = articleYears(sourceText);
  const targetYears = articleYears(targetText);
  if (sourceYears.size === 0 || targetYears.size === 0) return score;
  const hasSharedYear = [...sourceYears].some((year) => targetYears.has(year));
  return hasSharedYear ? Math.min(1, score + 0.05) : Math.max(0, score - 0.12);
}

function scoreHistoryItemForFile(nextFile: File, item: MetaFullTextHistorySummary) {
  const fileName = nextFile.name;
  const displayTitle = item.displayTitle || item.titleGuess || "";
  const fileKey = normalizedArticleFileKey(fileName);
  const historyFileKey = normalizedArticleFileKey(item.fileName);
  const titleKey = normalizedArticleFileKey(displayTitle);
  if (fileKey && historyFileKey && fileKey === historyFileKey) {
    return { score: 1, reason: "file name exact match" };
  }
  if (fileKey && titleKey && fileKey === titleKey) {
    return { score: 0.98, reason: "title exact match" };
  }
  if (fileKey && historyFileKey && fileKey.length >= 20 && historyFileKey.length >= 20) {
    if (fileKey.includes(historyFileKey) || historyFileKey.includes(fileKey)) {
      return { score: 0.94, reason: "file name contains saved file name" };
    }
  }
  if (fileKey && titleKey && fileKey.length >= 20 && titleKey.length >= 20) {
    if (fileKey.includes(titleKey) || titleKey.includes(fileKey)) {
      return { score: 0.92, reason: "file name contains saved title" };
    }
  }

  const sourceTokens = articleMatchTokens(fileName);
  const fileTokenScore = yearAdjustedScore(tokenOverlapScore(sourceTokens, articleMatchTokens(item.fileName)), fileName, item.fileName);
  const titleTokenScore = yearAdjustedScore(
    tokenOverlapScore(sourceTokens, articleMatchTokens(displayTitle)),
    fileName,
    displayTitle,
  );
  const score = Math.max(fileTokenScore, titleTokenScore);
  return {
    score,
    reason: titleTokenScore >= fileTokenScore ? "file/title token match" : "file name token match",
  };
}

function findBestHistoryMatchForFile(nextFile: File, historyItems: MetaFullTextHistorySummary[]) {
  const ranked = historyItems
    .map((item) => ({ item, ...scoreHistoryItemForFile(nextFile, item) }))
    .filter((candidate) => candidate.score >= 0.58)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return null;
  const runnerUp = ranked[1];
  if (best.score < 0.9 && runnerUp && best.score - runnerUp.score < 0.08) return null;
  return best;
}

function findDuplicateHistoryItemForFile(nextFile: File, historyItems: MetaFullTextHistorySummary[]) {
  return findBestHistoryMatchForFile(nextFile, historyItems)?.item ?? null;
}

function batchMatchForFile(nextFile: File, historyItems: MetaFullTextHistorySummary[]): BatchFileMatch | null {
  const match = findBestHistoryMatchForFile(nextFile, historyItems);
  if (!match) return null;
  return {
    targetId: match.item.id,
    targetFileName: match.item.fileName,
    targetTitleGuess: match.item.displayTitle || match.item.titleGuess,
    sourceFileSaved: match.item.sourceFileSaved,
    aiModelReviewCount: match.item.aiModelReviewCount,
    score: match.score,
    reason: match.reason,
  };
}

function duplicateMergePrompt(duplicates: { file: File; target: MetaFullTextHistorySummary }[]) {
  const preview = duplicates
    .slice(0, 5)
    .map((item) => `- ${item.file.name} -> ${item.target.fileName}`)
    .join("\n");
  const extra = duplicates.length > 5 ? `\n...and ${duplicates.length - 5} more` : "";
  return [
    `${duplicates.length} uploaded full-text file(s) match existing saved article record(s).`,
    "",
    "OK: update the matched existing record(s). The paper will not appear twice, and previous AI decisions/model reviews remain in the comparison history.",
    "Cancel: stop this run. Turn off update-matched-only mode if these uploads should be saved as new article records.",
    "",
    preview,
    extra,
  ]
    .filter(Boolean)
    .join("\n");
}

function decisionLabel(decision: MetaFullTextAnalysis["eligibility"]["decision"]) {
  if (decision === "include_quantitative") return "정량 분석 후보";
  if (decision === "include_narrative_support") return "서술/근거 후보";
  if (decision === "exclude") return "제외 후보";
  return "판정 보류";
}

function decisionTone(decision: MetaFullTextAnalysis["eligibility"]["decision"]) {
  if (decision === "include_quantitative") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (decision === "include_narrative_support") return "border-sky-200 bg-sky-50 text-sky-900";
  if (decision === "exclude") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function csvRows(columns: string[], rows: Record<string, string>[]) {
  return [
    columns,
    ...rows.map((row) => columns.map((column) => row[column] ?? "")),
  ]
    .map((row) =>
      row
        .map((cell) => {
          const safe = String(cell).replaceAll('"', '""');
          return /[",\n\r]/.test(safe) ? `"${safe}"` : safe;
        })
        .join(","),
    )
    .join("\n");
}

function boolLabel(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "확인 필요";
}

function formatFileSize(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1) {
    return `${megabytes.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("ko-KR")} KB`;
}

function nextUploadStartFromGoogleRange(range: string | null | undefined) {
  const match = /^bytes=0-(\d+)$/i.exec(range?.trim() ?? "");
  if (!match) return null;
  const lastReceivedByte = Number(match[1]);
  return Number.isSafeInteger(lastReceivedByte) && lastReceivedByte >= 0 ? lastReceivedByte + 1 : null;
}

async function uploadLargeFileThroughServerChunks(
  nextFile: File,
  session: DirectUploadSessionPayload,
  onStage: (message: string) => void,
) {
  const totalChunks = Math.ceil(nextFile.size / largeFileUploadChunkBytes);
  let uploadedFile: GoogleDriveUploadPayload | null = null;
  let start = 0;
  let chunkIndex = 0;

  while (start < nextFile.size) {
    chunkIndex += 1;
    const end = Math.min(nextFile.size, start + largeFileUploadChunkBytes) - 1;
    const chunk = nextFile.slice(start, end + 1);
    onStage(
      `Uploading large file through Meta server chunk ${chunkIndex}/${totalChunks} (${formatFileSize(
        end + 1,
      )}/${formatFileSize(nextFile.size)}).`,
    );

    let chunkResponse: Response;
    try {
      chunkResponse = await fetchWithTimeoutAndRetry(
        "/api/meta-analysis/full-text/upload-chunk",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-wiregene-upload-url": session.uploadUrl,
            "x-wiregene-chunk-start": String(start),
            "x-wiregene-chunk-end": String(end),
            "x-wiregene-file-size": String(nextFile.size),
            "x-wiregene-file-name": encodeURIComponent(nextFile.name).slice(0, 700),
          },
          body: chunk,
        },
        {
          label: `Large-file chunk ${chunkIndex}/${totalChunks} for ${nextFile.name}`,
          timeoutMs: fullTextChunkUploadTimeoutMs,
          attempts: chunkUploadMaxAttempts,
          onRetry: onStage,
        },
      );
    } catch (error) {
      throw new Error(
        `Large-file chunk upload failed before analysis. Details: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const payload = await readChunkUploadPayload(chunkResponse);
    if (payload.complete) {
      uploadedFile = payload.file ?? null;
      break;
    }

    const nextStart = nextUploadStartFromGoogleRange(payload.receivedRange) ?? end + 1;
    if (nextStart <= start || nextStart > nextFile.size) {
      throw new Error(
        `Large-file chunk upload returned an invalid resume offset: ${payload.receivedRange ?? "missing Range"}.`,
      );
    }
    start = nextStart;
  }

  if (!uploadedFile?.id) {
    throw new Error("Large-file chunk upload finished, but Google Drive did not return a file id.");
  }

  return uploadedFile;
}

function criteriaLabel(value: string) {
  return value.replaceAll("_", " ");
}

function batchFileId(file: File, index: number) {
  return `${index}-${file.name}-${file.size}-${file.lastModified}`;
}

function fileSelectionKey(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function mergeSelectedFiles(currentFiles: File[], nextFiles: File[]) {
  const seen = new Set<string>();
  const merged: File[] = [];
  for (const file of [...currentFiles, ...nextFiles]) {
    const key = fileSelectionKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

function batchStatusLabel(status: BatchAnalysisStatus) {
  if (status === "analyzing") return "analyzing";
  if (status === "saved") return "saved";
  if (status === "analyzed_not_saved") return "analyzed, not saved";
  if (status === "failed") return "failed";
  return "pending";
}

function batchStatusTone(status: BatchAnalysisStatus) {
  if (status === "analyzing") return "border-sky-200 bg-sky-50 text-sky-900";
  if (status === "saved") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "analyzed_not_saved") return "border-amber-200 bg-amber-50 text-amber-950";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function humanDecisionBucket(item: MetaFullTextHistorySummary) {
  if (!item.verificationComplete) return "pending";
  if (item.verificationMode === "ai_only") {
    if (item.piFinalDecision === "include_quantitative" || item.piFinalDecision === "include_narrative_support") return "include";
    if (item.piFinalDecision === "exclude") return "exclude";
    return "pending";
  }
  const decisions = [item.reviewerOneDecision, item.reviewerTwoDecision];
  if (decisions.every((decision) => decision === "include_quantitative" || decision === "include_narrative_support")) {
    return "include";
  }
  if (decisions.every((decision) => decision === "exclude")) return "exclude";
  return "conflict";
}

function isPrimaryQuantitativeIncludedSummary(item: MetaFullTextHistorySummary) {
  if (item.piFinalDecision === "include_quantitative") return true;
  if (item.piFinalDecision !== "pending") return false;
  if (item.verificationMode === "ai_only") return false;
  return (
    ["agreement", "resolved"].includes(item.conflictStatus) &&
    item.reviewerOneDecision === "include_quantitative" &&
    item.reviewerTwoDecision === "include_quantitative"
  );
}

function stripGeneratedReferenceContext(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^Excel source sheet: .+; review mode: .+$/.test(line.trim()))
    .join("\n")
    .trim();
}

function historyArticleNumber(item: Pick<MetaFullTextHistorySummary, "fileName">, fallbackIndex: number) {
  const match = item.fileName.trim().match(/^(\d{1,6})(?:[\s._-]+|$)/);
  return match?.[1] ?? String(fallbackIndex + 1);
}

function historyArticleNumberValue(item: Pick<MetaFullTextHistorySummary, "fileName">, fallbackIndex: number) {
  const value = Number.parseInt(historyArticleNumber(item, fallbackIndex), 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function historyArticleTitle(item: Pick<MetaFullTextHistorySummary, "displayTitle" | "titleGuess">) {
  const title = (item.displayTitle || item.titleGuess)?.replace(/\s+/g, " ").trim();
  return title || "제목 확인 전 - 선택 후 원문/엑셀 정보를 확인";
}

function historyFirstAuthorLabel(item: Pick<MetaFullTextHistorySummary, "firstAuthor">) {
  const author = item.firstAuthor?.replace(/\s+/g, " ").trim();
  return author || "1저자 확인 전";
}

function compactArticleNumberList(numbers: string[], limit = 30) {
  const visible = numbers.slice(0, limit).join(", ");
  const hiddenCount = Math.max(0, numbers.length - limit);
  return hiddenCount > 0 ? `${visible} 외 ${hiddenCount.toLocaleString("ko-KR")}개` : visible;
}

const historySortCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function compareNullableHistoryText(left: string | null | undefined, right: string | null | undefined, direction: HistorySortDirection) {
  const leftText = left?.replace(/\s+/g, " ").trim() ?? "";
  const rightText = right?.replace(/\s+/g, " ").trim() ?? "";
  const leftMissing = !leftText;
  const rightMissing = !rightText;
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  const result = historySortCollator.compare(leftText, rightText);
  return direction === "asc" ? result : -result;
}

const reviewerDecisionOptions: { value: ReviewerDecision; label: string }[] = [
  { value: "pending", label: "검증 전" },
  { value: "include_quantitative", label: "정량 포함" },
  { value: "include_narrative_support", label: "서술/근거 포함" },
  { value: "exclude", label: "제외" },
  { value: "conflict", label: "불일치/논의" },
];

const piFinalDecisionOptions: { value: PiFinalDecision; label: string }[] = [
  { value: "pending", label: "PI final pending" },
  { value: "include_quantitative", label: "PI include quantitative" },
  { value: "include_narrative_support", label: "PI include narrative/support" },
  { value: "exclude", label: "PI exclude" },
];

const fixedExclusionReasons = [
  "해당 없음",
  "wrong population",
  "wrong outcome",
  "not original observational data",
  "treatment/intervention/RCT",
  "case report/review/conference-only",
  "non-English full text",
  "no extractable denominator-based outcome",
  "duplicate/overlap cohort",
];

const aiScreeningScoreGuide = [
  [
    "Confidence",
    "0-100 AI eligibility confidence. >=80 can support a draft decision; 70-79 requires careful reviewer check; <70 stays human-verification/pending. Confidence alone never proves quantitative extractability.",
  ],
  ["Score", "0-100 quality score for the AI full-text screening/extraction output. high 85-100, moderate 65-84, low 40-64, unsafe <40."],
  ["Grade", "Categorical quality label from the same quality review. low/unsafe overrides a high-looking decision and requires manual verification before include/exclude."],
  [
    "Quantitative include",
    "Use only when decision=정량 분석 후보, confidence>=80, score>=65, grade high/moderate, denominator/numerator or prevalence is extractable, numeric fieldEvidence exists, and model drafts do not materially conflict.",
  ],
  ["Narrative/support", "Use when the article fits the topic but quantitative n/total or effect-size extraction is incomplete."],
  ["Exclude", "Use when decision=제외, confidence>=80, and a fixed exclusion reason is clearly supported by the full text."],
  ["Hold/manual", "Use when confidence<70, score<65, grade low/unsafe, critical fields are missing, numeric evidence is absent, or AI model reviewers disagree."],
] as const;

const historySortOptions: { value: HistorySortKey; label: string }[] = [
  { value: "number", label: "번호순" },
  { value: "title", label: "제목순" },
  { value: "first_author", label: "1저자순" },
];

const recommendedGeminiReviewerModelName = "gemini-3.1-flash-lite";

function aiReviewerRunnable(slot: MetaAiReviewerSlotSummary) {
  return Boolean(slot.apiKeySource !== "missing" && (slot.providerType === "OPENAI" || slot.baseUrl || looksLikeOpenAiModel(slot.modelName)));
}

function aiReviewerStatus(slot: MetaAiReviewerSlotSummary) {
  if (slot.apiKeySource === "missing") return "missing API key";
  if (slot.providerType === "OPENAI_COMPATIBLE" && !slot.baseUrl && !looksLikeOpenAiModel(slot.modelName)) return "missing Base URL";
  if (!slot.enabled) return "ready, off by default";
  if (slot.providerType === "OPENAI_COMPATIBLE" && !slot.baseUrl) return "ready via OpenAI";
  return "ready";
}

function looksLikeOpenAiModel(modelName: string) {
  return /^(gpt-|o\d|o-|chatgpt-|ft:)/i.test(modelName.trim());
}

function isGoogleGeminiOpenAiBaseUrl(baseUrl: string | null | undefined) {
  return /generativelanguage\.googleapis\.com\/v1beta\/openai\/?$/i.test(baseUrl?.trim() ?? "");
}

function aiReviewerModelDisplay(slot: MetaAiReviewerSlotSummary) {
  if (
    slot.providerType === "OPENAI_COMPATIBLE" &&
    isGoogleGeminiOpenAiBaseUrl(slot.baseUrl) &&
    isLegacyGeminiReviewerModel(slot.modelName)
  ) {
    return `${slot.modelName} -> ${recommendedGeminiReviewerModelName}`;
  }
  return slot.modelName;
}

function isLegacyGeminiReviewerModel(modelName: string) {
  const normalized = modelName.trim().toLowerCase();
  return normalized === "gemini-3.5" || normalized === "gemini-3.5-flash";
}

function sameStringMembers(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export function MetaFullTextAssistant({ extractionColumns, focus, projectId, worksheetOptions = [] }: MetaFullTextAssistantProps) {
  const analyzingRef = useRef(false);
  const batchWakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<BatchAnalysisResult[]>([]);
  const [worksheetName, setWorksheetName] = useState(worksheetOptions[0]?.sheetName ?? "");
  const [referenceRecord, setReferenceRecord] = useState("");
  const [researcherAiGuidance, setResearcherAiGuidance] = useState(defaultMetaFullTextResearcherGuidance);
  const [analysis, setAnalysis] = useState<MetaFullTextAnalysis | null>(null);
  const [historyItems, setHistoryItems] = useState<MetaFullTextHistorySummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyStats, setHistoryStats] = useState<MetaFullTextHistoryStats>({
    totalCount: 0,
    verificationCompletedCount: 0,
  });
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [reviewerOneName, setReviewerOneName] = useState("");
  const [reviewerTwoName, setReviewerTwoName] = useState("");
  const [reviewerOneDecision, setReviewerOneDecision] = useState<ReviewerDecision>("pending");
  const [reviewerTwoDecision, setReviewerTwoDecision] = useState<ReviewerDecision>("pending");
  const [fixedExclusionReason, setFixedExclusionReason] = useState(fixedExclusionReasons[0]);
  const [conflictStatus, setConflictStatus] = useState("needs human verification");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [verificationMode, setVerificationMode] = useState<"dual_reviewer" | "ai_only">("dual_reviewer");
  const [reviewerReviewSkippedAt, setReviewerReviewSkippedAt] = useState<string | null>(null);
  const [reviewerReviewSkipReason, setReviewerReviewSkipReason] = useState("");
  const [piName, setPiName] = useState("");
  const [piFinalDecision, setPiFinalDecision] = useState<PiFinalDecision>("pending");
  const [piFinalReason, setPiFinalReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingVerification, setIsSavingVerification] = useState(false);
  const [isSavingReviewerSettings, setIsSavingReviewerSettings] = useState(false);
  const [isReanalyzingSavedSource, setIsReanalyzingSavedSource] = useState(false);
  const [isSavingSourceToHistory, setIsSavingSourceToHistory] = useState(false);
  const [aiReviewerSlots, setAiReviewerSlots] = useState<MetaAiReviewerSlotSummary[]>([]);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [selectedHistoryIdsForDelete, setSelectedHistoryIdsForDelete] = useState<string[]>([]);
  const [isBatchDeletingHistory, setIsBatchDeletingHistory] = useState(false);
  const [selectedAiReviewerIds, setSelectedAiReviewerIds] = useState<string[]>([]);
  const [batchExistingOnlyMode, setBatchExistingOnlyMode] = useState(false);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [aiSettingsError, setAiSettingsError] = useState("");
  const [reviewerNamesSaved, setReviewerNamesSaved] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historySortKey, setHistorySortKey] = useState<HistorySortKey>("number");
  const [historySortDirection, setHistorySortDirection] = useState<HistorySortDirection>("asc");
  const [selectedAiReviewRun, setSelectedAiReviewRun] = useState<{
    selectedIds: string[];
    sourceSavedIds: string[];
  } | null>(null);

  const reviewerNamesReady = Boolean(reviewerOneName.trim()) && Boolean(reviewerTwoName.trim());
  const reviewerSettingsReady = reviewerNamesReady && reviewerNamesSaved;
  const selectedFileSize = useMemo(() => files.reduce((total, item) => total + item.size, 0), [files]);
  const firstSelectedFile = files[0] ?? null;
  const selectedFileLabel =
    files.length === 0
      ? "PDF, Word, TXT"
      : files.length === 1 && firstSelectedFile
        ? firstSelectedFile.name
        : `${files.length.toLocaleString("ko-KR")} files selected`;
  const selectedFileDetail =
    files.length === 0
      ? "full-text source files"
      : files.length === 1 && firstSelectedFile
        ? formatFileSize(firstSelectedFile.size)
        : `${files.length.toLocaleString("ko-KR")} files - ${formatFileSize(selectedFileSize)} total`;
  const runnableAiReviewerSlots = useMemo(() => aiReviewerSlots.filter(aiReviewerRunnable), [aiReviewerSlots]);
  const selectedRunnableAiReviewerIds = useMemo(
    () => selectedAiReviewerIds.filter((id) => runnableAiReviewerSlots.some((slot) => slot.id === id)),
    [runnableAiReviewerSlots, selectedAiReviewerIds],
  );
  const selectedAiReviewerLabel = selectedRunnableAiReviewerIds.length
    ? selectedRunnableAiReviewerIds
        .map((id) => aiReviewerSlots.find((slot) => slot.id === id)?.label ?? id)
        .join(", ")
    : "no runnable AI reviewer selected";
  const batchSavedCount = batchResults.filter((item) => item.status === "saved").length;
  const batchAnalyzedNotSavedCount = batchResults.filter((item) => item.status === "analyzed_not_saved").length;
  const batchFailedCount = batchResults.filter((item) => item.status === "failed").length;
  const batchFinishedCount = batchSavedCount + batchAnalyzedNotSavedCount + batchFailedCount;
  const currentHistoryItem = useMemo(
    () => historyItems.find((item) => item.id === currentHistoryId) ?? null,
    [currentHistoryId, historyItems],
  );
  const currentHistoryIndex = useMemo(
    () => (currentHistoryItem ? historyItems.findIndex((item) => item.id === currentHistoryItem.id) : -1),
    [currentHistoryItem, historyItems],
  );
  const historyOriginalIndexById = useMemo(
    () => new Map(historyItems.map((item, index) => [item.id, index])),
    [historyItems],
  );
  const canSaveSourceToLegacyRecord = Boolean(
    currentHistoryItem &&
      !currentHistoryItem.sourceFileSaved &&
      files.length === 1 &&
      firstSelectedFile &&
      !isAnalyzing &&
      !isSavingSourceToHistory,
  );
  const canUpgradeLegacyRecordWithAi = canSaveSourceToLegacyRecord && selectedRunnableAiReviewerIds.length > 0;
  const savedSourceActionDisabled =
    isReanalyzingSavedSource ||
    isSavingSourceToHistory ||
    selectedRunnableAiReviewerIds.length === 0 ||
    !currentHistoryItem ||
    (!currentHistoryItem.sourceFileSaved && !canSaveSourceToLegacyRecord);
  const savedSourceActionLabel =
    selectedRunnableAiReviewerIds.length === 0
      ? "Select ready AI reviewers first"
      : !currentHistoryItem
        ? "Select a saved record first"
        : currentHistoryItem.sourceFileSaved
          ? "Update this saved record with selected AI reviewers"
          : canSaveSourceToLegacyRecord
            ? "Save source and run selected AI reviewers"
            : "Choose one matching file for this legacy record";
  const savedSourceActionHelp = !currentHistoryItem
    ? "Select one saved article record first. This saved-source path updates that record instead of creating another saved article."
    : currentHistoryItem.sourceFileSaved
      ? "This will reuse the stored full-text source and replace the AI analysis in the same saved record. The saved article count does not increase."
      : canSaveSourceToLegacyRecord
        ? "This will attach the selected full-text file to this legacy record, automatically run the selected AI reviewers, and replace the AI analysis in this same record. It does not create a duplicate."
        : "Legacy/no source means the previous AI result exists, but the original full-text file is not stored. Select exactly one matching full-text file to update this record.";
  const aiOnlyVerificationMode = verificationMode === "ai_only";
  const riskOfBiasResearcherGuidance = useMemo(
    () =>
      normalizeMetaFullTextResearcherGuidance(
        [
          "# JBI RoB rerun lock",
          musicianPrmdRiskOfBiasGuidance,
          "",
          "# Default Musician PRMD full-text guide",
          defaultMetaFullTextResearcherGuidance,
        ].join("\n"),
      ),
    [],
  );
  const aiComparisonTargetCount = useMemo(() => {
    const enabledSlotCount = aiReviewerSlots.filter((slot) => slot.enabled).length;
    const storedReviewerTarget = historyItems.reduce(
      (maxCount, item) => Math.max(maxCount, item.aiModelReviewCount, item.modelReviewCount),
      0,
    );

    return Math.max(
      3,
      enabledSlotCount,
      selectedRunnableAiReviewerIds.length,
      runnableAiReviewerSlots.length,
      storedReviewerTarget,
    );
  }, [aiReviewerSlots, historyItems, runnableAiReviewerSlots.length, selectedRunnableAiReviewerIds.length]);
  const aiComparisonProgress = useMemo(() => {
    const target = Math.max(1, aiComparisonTargetCount);
    return {
      target,
      complete: historyItems.filter((item) => item.aiModelReviewCount >= target).length,
      savedSourceNeedsRun: historyItems.filter((item) => item.sourceFileSaved && item.aiModelReviewCount < target).length,
      uploadNeeded: historyItems.filter((item) => !item.sourceFileSaved && item.aiModelReviewCount < target).length,
    };
  }, [aiComparisonTargetCount, historyItems]);
  const historyDecisionCounts = useMemo(
    () => ({
      all: historyItems.length,
      include_quantitative: historyItems.filter((item) => item.decision === "include_quantitative").length,
      uncertain: historyItems.filter((item) => item.decision === "uncertain").length,
      exclude: historyItems.filter((item) => item.decision === "exclude").length,
      include_narrative_support: historyItems.filter((item) => item.decision === "include_narrative_support").length,
      legacy_source: historyItems.filter((item) => !item.sourceFileSaved).length,
      primary_quantitative_included: historyItems.filter(isPrimaryQuantitativeIncludedSummary).length,
      primary_quantitative_source_saved: historyItems.filter(
        (item) => isPrimaryQuantitativeIncludedSummary(item) && item.sourceFileSaved,
      ).length,
      primary_quantitative_missing_source: historyItems.filter(
        (item) => isPrimaryQuantitativeIncludedSummary(item) && !item.sourceFileSaved,
      ).length,
      verification_pending: historyItems.filter((item) => !item.verificationComplete).length,
      verification_complete: historyItems.filter((item) => item.verificationComplete).length,
    }),
    [historyItems],
  );
  const primaryQuantitativeIncludedHistoryItems = useMemo(
    () => historyItems.filter(isPrimaryQuantitativeIncludedSummary),
    [historyItems],
  );
  const primaryQuantitativeIncludedSourceSavedHistoryItems = useMemo(
    () => primaryQuantitativeIncludedHistoryItems.filter((item) => item.sourceFileSaved),
    [primaryQuantitativeIncludedHistoryItems],
  );
  const primaryQuantitativeIncludedLegacyHistoryItems = useMemo(
    () => primaryQuantitativeIncludedHistoryItems.filter((item) => !item.sourceFileSaved),
    [primaryQuantitativeIncludedHistoryItems],
  );
  const historySheetProgress = useMemo(() => {
    const rows = new Map<
      string,
      {
        label: string;
        saved: number;
        verified: number;
        humanInclude: number;
        humanExclude: number;
        pending: number;
        conflict: number;
      }
    >();
    for (const item of historyItems) {
      const key = item.sourceSheet || "No Excel sheet";
      const row = rows.get(key) ?? {
        label: item.sourceLabel ? `${key} · ${item.sourceLabel}` : key,
        saved: 0,
        verified: 0,
        humanInclude: 0,
        humanExclude: 0,
        pending: 0,
        conflict: 0,
      };
      row.saved += 1;
      if (item.verificationComplete) row.verified += 1;
      const bucket = humanDecisionBucket(item);
      if (bucket === "include") row.humanInclude += 1;
      if (bucket === "exclude") row.humanExclude += 1;
      if (bucket === "pending") row.pending += 1;
      if (bucket === "conflict") row.conflict += 1;
      rows.set(key, row);
    }
    return [...rows.values()].sort((left, right) => right.saved - left.saved);
  }, [historyItems]);
  const filteredHistoryItems = useMemo(
    () =>
      historyItems.filter((item) => {
        if (historyFilter === "all") return true;
        if (historyFilter === "legacy_source") return !item.sourceFileSaved;
        if (historyFilter === "primary_quantitative_included") return isPrimaryQuantitativeIncludedSummary(item);
        if (historyFilter === "verification_pending") return !item.verificationComplete;
        if (historyFilter === "verification_complete") return item.verificationComplete;
        return item.decision === historyFilter;
      }),
    [historyFilter, historyItems],
  );
  const sortedHistoryItems = useMemo(() => {
    const directionMultiplier = historySortDirection === "asc" ? 1 : -1;
    return [...filteredHistoryItems].sort((left, right) => {
      const leftIndex = historyOriginalIndexById.get(left.id) ?? 0;
      const rightIndex = historyOriginalIndexById.get(right.id) ?? 0;
      const leftArticleNumber = historyArticleNumberValue(left, leftIndex);
      const rightArticleNumber = historyArticleNumberValue(right, rightIndex);

      let result = 0;
      if (historySortKey === "number") {
        result = (leftArticleNumber - rightArticleNumber) * directionMultiplier;
      } else if (historySortKey === "title") {
        result = compareNullableHistoryText(left.displayTitle || left.titleGuess, right.displayTitle || right.titleGuess, historySortDirection);
      } else {
        result = compareNullableHistoryText(left.firstAuthor, right.firstAuthor, historySortDirection);
      }

      if (result !== 0) return result;
      if (leftArticleNumber !== rightArticleNumber) return leftArticleNumber - rightArticleNumber;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.id.localeCompare(right.id);
    });
  }, [filteredHistoryItems, historyOriginalIndexById, historySortDirection, historySortKey]);
  const selectedHistoryDeleteSet = useMemo(
    () => new Set(selectedHistoryIdsForDelete),
    [selectedHistoryIdsForDelete],
  );
  const visibleHistoryIds = useMemo(() => sortedHistoryItems.map((item) => item.id), [sortedHistoryItems]);
  const selectedVisibleHistoryDeleteCount = useMemo(
    () => visibleHistoryIds.filter((id) => selectedHistoryDeleteSet.has(id)).length,
    [selectedHistoryDeleteSet, visibleHistoryIds],
  );
  const selectedHistoryItemsForAction = useMemo(
    () => sortedHistoryItems.filter((item) => selectedHistoryDeleteSet.has(item.id)),
    [selectedHistoryDeleteSet, sortedHistoryItems],
  );
  const selectedSourceSavedHistoryItemsForAction = useMemo(
    () => selectedHistoryItemsForAction.filter((item) => item.sourceFileSaved),
    [selectedHistoryItemsForAction],
  );
  const selectedLegacyHistoryItemsForAction = useMemo(
    () => selectedHistoryItemsForAction.filter((item) => !item.sourceFileSaved),
    [selectedHistoryItemsForAction],
  );
  const selectedLegacyArticleNumbersForAction = useMemo(
    () =>
      selectedLegacyHistoryItemsForAction.map((item, index) =>
        historyArticleNumber(item, historyOriginalIndexById.get(item.id) ?? index),
      ),
    [historyOriginalIndexById, selectedLegacyHistoryItemsForAction],
  );
  const selectedLegacyArticleNumberText = useMemo(
    () => compactArticleNumberList(selectedLegacyArticleNumbersForAction),
    [selectedLegacyArticleNumbersForAction],
  );
  const selectedHistoryIdsForAction = useMemo(
    () => selectedHistoryItemsForAction.map((item) => item.id),
    [selectedHistoryItemsForAction],
  );
  const selectedSourceSavedHistoryIdsForAction = useMemo(
    () => selectedSourceSavedHistoryItemsForAction.map((item) => item.id),
    [selectedSourceSavedHistoryItemsForAction],
  );
  const selectedAiReviewRunMatchesCurrentSelection = selectedAiReviewRun
    ? sameStringMembers(selectedAiReviewRun.selectedIds, selectedHistoryIdsForAction)
    : false;
  const selectedAiReviewRunIsDisplayed =
    Boolean(selectedAiReviewRun) && (isReanalyzingSavedSource || selectedAiReviewRunMatchesCurrentSelection);
  const selectedArticleAiReviewTotalCount = selectedAiReviewRunIsDisplayed
    ? (selectedAiReviewRun?.selectedIds.length ?? 0)
    : selectedHistoryItemsForAction.length;
  const selectedArticleAiReviewSourceIdSet = useMemo(
    () =>
      new Set(
        selectedAiReviewRunIsDisplayed
          ? (selectedAiReviewRun?.sourceSavedIds ?? [])
          : selectedSourceSavedHistoryIdsForAction,
      ),
    [selectedAiReviewRun, selectedAiReviewRunIsDisplayed, selectedSourceSavedHistoryIdsForAction],
  );
  const selectedSavedSourceRunResults = useMemo(
    () =>
      batchResults.filter(
        (item) => item.savedSourceRerun && Boolean(item.savedRecordId) && selectedArticleAiReviewSourceIdSet.has(item.savedRecordId ?? ""),
      ),
    [batchResults, selectedArticleAiReviewSourceIdSet],
  );
  const selectedSavedSourceRunFinishedCount = useMemo(
    () =>
      selectedSavedSourceRunResults.filter(
        (item) => item.status === "saved" || item.status === "analyzed_not_saved" || item.status === "failed",
      ).length,
    [selectedSavedSourceRunResults],
  );
  const selectedArticleAiReviewCompletedCount = selectedAiReviewRunIsDisplayed ? selectedSavedSourceRunFinishedCount : 0;
  const selectedArticleAiReviewProgressLabel = `${selectedArticleAiReviewCompletedCount.toLocaleString("ko-KR")}/${selectedArticleAiReviewTotalCount.toLocaleString("ko-KR")}`;
  const visibleSourceSavedHistoryCount = useMemo(
    () => sortedHistoryItems.filter((item) => item.sourceFileSaved).length,
    [sortedHistoryItems],
  );
  const visibleMissingSourceHistoryCount = Math.max(0, sortedHistoryItems.length - visibleSourceSavedHistoryCount);
  const allVisibleHistorySelectedForDelete =
    visibleHistoryIds.length > 0 && selectedVisibleHistoryDeleteCount === visibleHistoryIds.length;
  const selectedHistoryAiReviewDisabled =
    selectedHistoryItemsForAction.length === 0 ||
    selectedRunnableAiReviewerIds.length === 0 ||
    isAnalyzing ||
    isReanalyzingSavedSource ||
    isSavingSourceToHistory;
  const batchFileMatches = useMemo(
    () => files.map((file) => batchMatchForFile(file, historyItems)),
    [files, historyItems],
  );
  const batchAutoMatchCount = batchFileMatches.filter(Boolean).length;
  const batchUnmatchedCount = Math.max(0, files.length - batchAutoMatchCount);
  const preventUnmatchedNewRecords = batchExistingOnlyMode && historyItems.length > 0;
  const analyzeButtonLabel = isAnalyzing
    ? "Analyzing"
    : currentHistoryItem && !currentHistoryItem.sourceFileSaved && files.length === 1
      ? "Use saved-record update button above"
    : files.length > 1
      ? preventUnmatchedNewRecords
        ? `Update matched records only (${files.length})`
        : `Analyze queue; save new articles (${files.length})`
      : files.length === 1
        ? preventUnmatchedNewRecords
          ? "Update matched record only"
          : "Analyze full text; save new"
        : "Analyze full text";

  const extractionCsv = useMemo(() => {
    if (!analysis) return "";
    return csvRows(analysis.extraction.columns, analysis.extraction.rows);
  }, [analysis]);
  const modelReviewCounts = useMemo(() => {
    const reviews = analysis?.modelReviews ?? [];
    return {
      total: reviews.length,
      succeeded: reviews.filter((review) => review.aiUsed && !review.warning).length,
      failed: reviews.filter((review) => !review.aiUsed || Boolean(review.warning)).length,
    };
  }, [analysis]);

  const selectedWorksheet = useMemo(
    () => worksheetOptions.find((worksheet) => worksheet.sheetName === worksheetName) ?? worksheetOptions[0] ?? null,
    [worksheetName, worksheetOptions],
  );

  const verificationCsv = useMemo(() => {
    if (!analysis) return "";
    return csvRows(
      [
        "file_name",
        "source_sheet",
        "ai_decision",
        "ai_confidence",
        "ai_review_score",
        "ai_review_grade",
        "ai_review_summary",
        "ai_review_improvement",
        "ai_review_criteria_json",
        "ai_model_reviews_json",
        "ai_config_source",
        "ai_warning",
        "verification_mode",
        "reviewer_review_skipped_at",
        "reviewer_review_skip_reason",
        "reviewer_1_name",
        "reviewer_2_name",
        "reviewer_1_decision",
        "reviewer_2_decision",
        "fixed_exclusion_reason",
        "conflict_status",
        "reviewer_notes",
        "pi_name",
        "pi_final_decision",
        "pi_final_reason",
        "analyzed_at",
      ],
      [
        {
          file_name: analysis.fileName,
          source_sheet: selectedWorksheet?.sheetName ?? "",
          ai_decision: analysis.eligibility.decision,
          ai_confidence: String(analysis.eligibility.confidence),
          ai_review_score: String(analysis.reviewEvaluation.score),
          ai_review_grade: analysis.reviewEvaluation.grade,
          ai_review_summary: analysis.reviewEvaluation.summary,
          ai_review_improvement: analysis.reviewEvaluation.improvement,
          ai_review_criteria_json: JSON.stringify(analysis.reviewEvaluation.criteria),
          ai_model_reviews_json: JSON.stringify(analysis.modelReviews),
          ai_researcher_guidance: analysis.researcherGuidance ?? "",
          ai_config_source: analysis.aiConfigSource ?? "",
          ai_warning: analysis.aiWarning ?? "",
          verification_mode: verificationMode,
          reviewer_review_skipped_at: reviewerReviewSkippedAt ?? "",
          reviewer_review_skip_reason: reviewerReviewSkipReason,
          reviewer_1_name: reviewerOneName,
          reviewer_2_name: reviewerTwoName,
          reviewer_1_decision: reviewerOneDecision,
          reviewer_2_decision: reviewerTwoDecision,
          fixed_exclusion_reason: fixedExclusionReason,
          conflict_status: conflictStatus,
          reviewer_notes: reviewerNotes,
          pi_name: piName,
          pi_final_decision: piFinalDecision,
          pi_final_reason: piFinalReason,
          analyzed_at: analysis.analyzedAt,
        },
      ],
    );
  }, [
    analysis,
    conflictStatus,
    fixedExclusionReason,
    verificationMode,
    reviewerReviewSkippedAt,
    reviewerReviewSkipReason,
    reviewerNotes,
    reviewerOneDecision,
    reviewerOneName,
    reviewerTwoDecision,
    reviewerTwoName,
    piName,
    piFinalDecision,
    piFinalReason,
    selectedWorksheet,
  ]);

  function resetVerificationState() {
    setVerificationMode("dual_reviewer");
    setReviewerOneDecision("pending");
    setReviewerTwoDecision("pending");
    setFixedExclusionReason(fixedExclusionReasons[0]);
    setConflictStatus("needs human verification");
    setReviewerNotes("");
    setReviewerReviewSkippedAt(null);
    setReviewerReviewSkipReason("");
    setPiName("");
    setPiFinalDecision("pending");
    setPiFinalReason("");
  }

  function applyVerification(verification?: Partial<MetaFullTextVerification> | null) {
    if (verification?.reviewerOneName) setReviewerOneName(verification.reviewerOneName);
    if (verification?.reviewerTwoName) setReviewerTwoName(verification.reviewerTwoName);
    setVerificationMode(verification?.verificationMode === "ai_only" ? "ai_only" : "dual_reviewer");
    setReviewerOneDecision((verification?.reviewerOneDecision as ReviewerDecision) || "pending");
    setReviewerTwoDecision((verification?.reviewerTwoDecision as ReviewerDecision) || "pending");
    setFixedExclusionReason(verification?.fixedExclusionReason || fixedExclusionReasons[0]);
    setConflictStatus(verification?.conflictStatus || "needs human verification");
    setReviewerNotes(verification?.reviewerNotes || "");
    setReviewerReviewSkippedAt(verification?.reviewerReviewSkippedAt ?? null);
    setReviewerReviewSkipReason(verification?.reviewerReviewSkipReason || "");
    setPiName(verification?.piName || "");
    setPiFinalDecision((verification?.piFinalDecision as PiFinalDecision) || "pending");
    setPiFinalReason(verification?.piFinalReason || "");
  }

  function upsertHistoryItem(item: MetaFullTextHistorySummary) {
    setHistoryItems((current) => [item, ...current.filter((record) => record.id !== item.id)].slice(0, 500));
  }

  const applyHistoryOverview = useCallback((payload: MetaFullTextHistoryOverviewPayload, options: { persistCache?: boolean } = {}) => {
    setHistoryItems(payload.records);
    setSelectedHistoryIdsForDelete((current) => {
      const validIds = new Set(payload.records.map((record) => record.id));
      return current.filter((id) => validIds.has(id));
    });
    if (payload.stats) setHistoryStats(payload.stats);
    if (payload.reviewerSettings) {
      setReviewerOneName(payload.reviewerSettings.reviewerOneName);
      setReviewerTwoName(payload.reviewerSettings.reviewerTwoName);
      setReviewerNamesSaved(
        Boolean(payload.reviewerSettings.reviewerOneName.trim()) &&
          Boolean(payload.reviewerSettings.reviewerTwoName.trim()),
      );
    }
    if (options.persistCache !== false) writeCachedFullTextHistoryOverview(projectId, payload);
  }, [projectId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const payload = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(payload);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Saved full-text analyses could not be loaded.";
      const cached = readCachedFullTextHistoryOverview(projectId);
      if (cached?.records.length) {
        applyHistoryOverview(cached, { persistCache: false });
        setHistoryError(
          `${fullTextHistoryUnavailableMessage(message)} Showing the last browser snapshot from ${new Date(cached.cachedAt).toLocaleString()}.`,
        );
      } else {
        setHistoryError(fullTextHistoryUnavailableMessage(message));
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [applyHistoryOverview, projectId]);

  const loadAiReviewerSettings = useCallback(async () => {
    setAiSettingsLoading(true);
    setAiSettingsError("");
    try {
      const payload = await readAiSettingsPayload(
        await fetch("/api/meta-analysis/ai-settings", { cache: "no-store" }),
      );
      setAiReviewerSlots(payload.reviewerSlots);
      const defaultIds = payload.reviewerSlots
        .filter((slot) => slot.enabled && aiReviewerRunnable(slot))
        .map((slot) => slot.id);
      const runnableIds = payload.reviewerSlots.filter(aiReviewerRunnable).map((slot) => slot.id);
      setSelectedAiReviewerIds((current) => {
        const currentRunnable = current.filter((id) => runnableIds.includes(id));
        return currentRunnable.length ? currentRunnable : defaultIds.length ? defaultIds : runnableIds;
      });
    } catch (caught) {
      setAiSettingsError(caught instanceof Error ? caught.message : "AI reviewer settings could not be loaded.");
    } finally {
      setAiSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialHistory() {
      try {
        const payload = await readHistoryListPayload(
          await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
        );
        if (!cancelled) applyHistoryOverview(payload);
      } catch (caught) {
        if (!cancelled) {
          const message = caught instanceof Error ? caught.message : "Saved full-text analyses could not be loaded.";
          const cached = readCachedFullTextHistoryOverview(projectId);
          if (cached?.records.length) {
            applyHistoryOverview(cached, { persistCache: false });
            setHistoryError(
              `${fullTextHistoryUnavailableMessage(message)} Showing the last browser snapshot from ${new Date(cached.cachedAt).toLocaleString()}.`,
            );
          } else {
            setHistoryError(fullTextHistoryUnavailableMessage(message));
          }
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadInitialHistory();
    return () => {
      cancelled = true;
    };
  }, [applyHistoryOverview, projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(aiGuidanceCacheKey(projectId));
      if (cached?.trim()) setResearcherAiGuidance(normalizeMetaFullTextResearcherGuidance(cached));
    } catch {
      // The default guidance remains usable even if browser storage is unavailable.
    }
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(aiGuidanceCacheKey(projectId), normalizeMetaFullTextResearcherGuidance(researcherAiGuidance));
    } catch {
      // Run-level guidance still goes to the API; local persistence is a convenience only.
    }
  }, [projectId, researcherAiGuidance]);

  useEffect(() => {
    void loadAiReviewerSettings();
  }, [loadAiReviewerSettings]);

  async function loadSavedAnalysis(id: string) {
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryRecordPayload(
        await fetch(fullTextHistoryRecordUrl(id, projectId), { cache: "no-store" }),
      );
      const record = payload.record;
      setAnalysis(record.analysis);
      setCurrentHistoryId(record.id);
      setReferenceRecord(stripGeneratedReferenceContext(record.referenceRecord));
      if (record.sourceSheet) setWorksheetName(record.sourceSheet);
      applyVerification(record.verification);
      setNotice(`Loaded saved analysis: ${record.fileName}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saved full-text analysis could not be loaded.");
    }
  }

  function toggleHistoryDeleteSelection(id: string, checked: boolean) {
    setSelectedHistoryIdsForDelete((current) => {
      if (checked) return Array.from(new Set([...current, id]));
      return current.filter((currentId) => currentId !== id);
    });
  }

  function toggleVisibleHistoryDeleteSelection(checked: boolean) {
    setSelectedHistoryIdsForDelete((current) => {
      const visibleIds = new Set(visibleHistoryIds);
      if (!checked) return current.filter((id) => !visibleIds.has(id));
      return Array.from(new Set([...current, ...visibleHistoryIds]));
    });
  }

  function clearHistoryDeleteSelection() {
    setSelectedHistoryIdsForDelete([]);
  }

  function prepareRiskOfBiasReanalysisSelection() {
    if (primaryQuantitativeIncludedSourceSavedHistoryItems.length === 0) {
      setError(
        "No primary quantitative included record has a saved full-text source yet. Upload and match the full-text PDF/Word files first.",
      );
      return;
    }

    const readyReviewerIds = runnableAiReviewerSlots.map((slot) => slot.id).slice(0, 3);
    const legacyArticleNumbers = primaryQuantitativeIncludedLegacyHistoryItems.map((item, index) =>
      historyArticleNumber(item, historyOriginalIndexById.get(item.id) ?? index),
    );

    setHistoryFilter("primary_quantitative_included");
    setSelectedHistoryIdsForDelete(primaryQuantitativeIncludedSourceSavedHistoryItems.map((item) => item.id));
    setResearcherAiGuidance(riskOfBiasResearcherGuidance);
    setSelectedAiReviewerIds(readyReviewerIds);
    setError("");
    setNotice(
      [
        `JBI RoB rerun prepared: ${primaryQuantitativeIncludedSourceSavedHistoryItems.length.toLocaleString(
          "ko-KR",
        )} primary quantitative included record(s) with saved full text selected.`,
        `${primaryQuantitativeIncludedLegacyHistoryItems.length.toLocaleString(
          "ko-KR",
        )} primary quantitative included legacy/no-source record(s) need full-text upload before RoB rerun.`,
        legacyArticleNumbers.length ? `Upload-needed article numbers: ${compactArticleNumberList(legacyArticleNumbers)}.` : "",
        readyReviewerIds.length
          ? `Selected AI reviewers: ${readyReviewerIds.length.toLocaleString("ko-KR")} ready model(s).`
          : "No ready AI reviewer is selected yet; refresh AI slots or set API keys before running.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  function updateHistorySort(nextKey: HistorySortKey) {
    if (historySortKey === nextKey) {
      setHistorySortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setHistorySortKey(nextKey);
    setHistorySortDirection("asc");
  }

  async function deleteSavedHistoryRecord(id: string) {
    const item = historyItems.find((record) => record.id === id);
    if (!item) {
      setError("Select a saved full-text record before deleting.");
      return;
    }
    const confirmed = window.confirm(
      [
        "Delete this saved full-text analysis record from the database?",
        "",
        item.fileName,
        "",
        "This removes the saved AI model comparison, reviewer verification, extracted dataset draft, and any unshared stored full-text source file for this record. This cannot be undone.",
      ].join("\n"),
    );
    if (!confirmed) return;

    setDeletingHistoryId(id);
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryListPayload(
        await fetch(fullTextHistoryRecordUrl(id, projectId), {
          method: "DELETE",
        }),
      );
      applyHistoryOverview(payload);
      setSelectedHistoryIdsForDelete((current) => current.filter((currentId) => currentId !== id));
      if (currentHistoryId === id) {
        setCurrentHistoryId(null);
        setAnalysis(null);
        setReferenceRecord("");
        resetVerificationState();
      }
      setNotice(
        [
          `Deleted saved full-text record: ${payload.deletedRecord?.fileName ?? item.fileName}.`,
          `Saved files: ${payload.stats.totalCount}; verification completed: ${payload.stats.verificationCompletedCount}.`,
          payload.sourceFileDeleteWarning ? `Source file warning: ${payload.sourceFileDeleteWarning}` : "",
        ].filter(Boolean).join(" "),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saved full-text analysis could not be deleted.");
    } finally {
      setDeletingHistoryId(null);
    }
  }

  async function deleteSelectedHistoryRecords() {
    const selectedIds = selectedHistoryIdsForDelete.filter((id) => historyItems.some((item) => item.id === id));
    if (selectedIds.length === 0) {
      setError("Select saved full-text records before batch deletion.");
      return;
    }

    const selectedItems = historyItems.filter((item) => selectedIds.includes(item.id));
    const preview = selectedItems
      .slice(0, 6)
      .map((item) => `- ${item.fileName}`)
      .join("\n");
    const remainingCount = selectedItems.length > 6 ? `\n...and ${selectedItems.length - 6} more` : "";
    const confirmed = window.confirm(
      [
        `Delete ${selectedItems.length.toLocaleString("ko-KR")} selected saved full-text analysis record(s) from the database?`,
        "",
        preview + remainingCount,
        "",
        "This removes saved AI model comparisons, reviewer verification, extracted dataset drafts, and any unshared stored full-text source files for the selected records. This cannot be undone.",
      ].join("\n"),
    );
    if (!confirmed) return;

    setIsBatchDeletingHistory(true);
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            ids: selectedIds,
          }),
        }),
      );
      applyHistoryOverview(payload);
      clearHistoryDeleteSelection();

      if (currentHistoryId && selectedIds.includes(currentHistoryId)) {
        setCurrentHistoryId(null);
        setAnalysis(null);
        setReferenceRecord("");
        resetVerificationState();
      }

      const deletedCount = payload.deletedRecords?.length ?? selectedItems.length;
      const sourceDeletedCount = payload.sourceFileDeletedCount ?? (payload.sourceFileDeleted ? 1 : 0);
      const sourceWarnings = payload.sourceFileDeleteWarnings?.length
        ? ` Source file warnings: ${payload.sourceFileDeleteWarnings.join(" / ")}`
        : payload.sourceFileDeleteWarning
          ? ` Source file warning: ${payload.sourceFileDeleteWarning}`
          : "";
      setNotice(
        [
          `Deleted ${deletedCount.toLocaleString("ko-KR")} saved full-text record(s).`,
          `Saved files: ${payload.stats.totalCount}; verification completed: ${payload.stats.verificationCompletedCount}.`,
          `Source files deleted: ${sourceDeletedCount}.`,
          sourceWarnings,
        ].filter(Boolean).join(" "),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Selected saved full-text analyses could not be deleted.");
    } finally {
      setIsBatchDeletingHistory(false);
    }
  }

  async function saveReviewerSettings() {
    setIsSavingReviewerSettings(true);
    setError("");
    setNotice("");
    try {
      const payload = await readReviewerSettingsPayload(
        await fetch(fullTextHistoryListUrl(projectId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            reviewerOneName,
            reviewerTwoName,
          }),
        }),
      );
      applyHistoryOverview(payload);
      setReviewerNamesSaved(true);
      setNotice(
        `저장완료: Reviewer names saved. Saved files: ${payload.stats.totalCount}; verification completed: ${payload.stats.verificationCompletedCount}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reviewer names could not be saved.");
    } finally {
      setIsSavingReviewerSettings(false);
    }
  }

  function toggleAiReviewerSelection(slotId: string, checked: boolean) {
    setSelectedAiReviewerIds((current) => {
      if (checked) return Array.from(new Set([...current, slotId]));
      return current.filter((id) => id !== slotId);
    });
  }

  async function saveVerification() {
    if (!currentHistoryId) {
      setError("This analysis is not linked to a saved history record yet.");
      return;
    }

    setIsSavingVerification(true);
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryRecordPayload(
        await fetch(fullTextHistoryRecordUrl(currentHistoryId, projectId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            verificationMode,
            reviewerOneDecision,
            reviewerTwoDecision,
            reviewerOneName,
            reviewerTwoName,
            fixedExclusionReason,
            conflictStatus,
            reviewerNotes,
            reviewerReviewSkipReason,
            piName,
            piFinalDecision,
            piFinalReason,
          }),
        }),
      );
      applyVerification(payload.record.verification);
      const overview = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(overview);
      setNotice(
        `저장완료: Verification saved. Saved files: ${overview.stats.totalCount}; verification completed: ${overview.stats.verificationCompletedCount}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reviewer verification could not be saved.");
    } finally {
      setIsSavingVerification(false);
    }
  }

  async function skipReviewerWorkflowForAiOnly() {
    if (!currentHistoryId || !analysis) {
      setError("Open a saved full-text analysis before switching to AI-only verification.");
      return;
    }

    const aiFinalDecision =
      analysis.eligibility.decision === "uncertain" ? "pending" : (analysis.eligibility.decision as PiFinalDecision);
    const nextPiFinalDecision = piFinalDecision !== "pending" ? piFinalDecision : aiFinalDecision;
    const skipReason =
      reviewerReviewSkipReason ||
      `Researcher selected AI-only verification after comparing ${analysis.modelReviews.length || 1} AI model reviewer draft(s).`;
    const nextPiFinalReason =
      piFinalReason ||
      (nextPiFinalDecision !== "pending"
        ? `AI-only workflow selected. PI final decision follows AI/model comparison draft: ${nextPiFinalDecision}.`
        : "");
    const nextReviewerNotes = [
      reviewerNotes,
      `Reviewer 1/2 independent verification skipped. ${skipReason}`,
    ]
      .filter(Boolean)
      .join("\n");

    setIsSavingVerification(true);
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryRecordPayload(
        await fetch(fullTextHistoryRecordUrl(currentHistoryId, projectId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            verificationMode: "ai_only",
            reviewerOneName,
            reviewerTwoName,
            reviewerOneDecision: "pending",
            reviewerTwoDecision: "pending",
            fixedExclusionReason,
            conflictStatus: "ai-only model review",
            reviewerNotes: nextReviewerNotes,
            reviewerReviewSkipReason: skipReason,
            piName,
            piFinalDecision: nextPiFinalDecision,
            piFinalReason: nextPiFinalReason,
          }),
        }),
      );
      applyVerification(payload.record.verification);
      const overview = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(overview);
      setNotice(
        `AI-only workflow saved. Reviewer 1/2 verification is skipped for this record. Saved files: ${overview.stats.totalCount}; verification completed: ${overview.stats.verificationCompletedCount}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI-only reviewer skip could not be saved.");
    } finally {
      setIsSavingVerification(false);
    }
  }

  async function restoreDualReviewerWorkflow() {
    if (!currentHistoryId) {
      setError("Open a saved full-text analysis before restoring reviewer workflow.");
      return;
    }

    setIsSavingVerification(true);
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryRecordPayload(
        await fetch(fullTextHistoryRecordUrl(currentHistoryId, projectId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            verificationMode: "dual_reviewer",
            reviewerOneName,
            reviewerTwoName,
            reviewerOneDecision,
            reviewerTwoDecision,
            fixedExclusionReason,
            conflictStatus: "needs human verification",
            reviewerNotes,
            reviewerReviewSkipReason: "",
            piName,
            piFinalDecision,
            piFinalReason,
          }),
        }),
      );
      applyVerification(payload.record.verification);
      const overview = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(overview);
      setNotice("Reviewer 1/2 workflow restored for this record.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reviewer workflow could not be restored.");
    } finally {
      setIsSavingVerification(false);
    }
  }

  async function reanalyzeSavedHistoryItem(item: MetaFullTextHistorySummary, onStage: (message: string) => void) {
    const payload = await readHistoryRecordPayload(
      await fetchWithTimeoutAndRetry(
        fullTextHistoryRecordUrl(item.id, projectId, "reanalyze"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            reviewerIds: selectedRunnableAiReviewerIds,
            researcherGuidance: normalizeMetaFullTextResearcherGuidance(researcherAiGuidance),
          }),
        },
        {
          label: `Saved-source AI reanalysis for ${item.fileName}`,
          timeoutMs: fullTextReanalysisRequestTimeoutMs,
          attempts: batchAnalysisMaxAttempts,
          onRetry: onStage,
        },
      ),
    );
    return payload.record;
  }

  async function reanalyzeSavedSource() {
    if (!currentHistoryId || !currentHistoryItem) {
      setError("Open a saved full-text record before reanalyzing.");
      return;
    }
    if (selectedRunnableAiReviewerIds.length === 0) {
      setError("Select at least one ready AI reviewer model before running saved full-text comparison.");
      return;
    }
    setIsReanalyzingSavedSource(true);
    setError("");
    setNotice("");
    try {
      const record = await reanalyzeSavedHistoryItem(currentHistoryItem, setNotice);
      setAnalysis(record.analysis);
      setCurrentHistoryId(record.id);
      setReferenceRecord(stripGeneratedReferenceContext(record.referenceRecord));
      if (record.sourceSheet) setWorksheetName(record.sourceSheet);
      applyVerification(record.verification);
      const overview = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(overview);
      const decisionChanged =
        currentHistoryItem?.decision && currentHistoryItem.decision !== record.analysis.eligibility.decision;
      setNotice(
        [
          `Ran selected AI reviewer(s) on saved full-text source: ${selectedAiReviewerLabel}.`,
          "Updated the same saved article record; no duplicate saved article was created.",
          `Primary AI decision/extraction now uses the selected rerun result: ${decisionLabel(record.analysis.eligibility.decision)}.`,
          decisionChanged ? "Recheck reviewer/PI adjudication because the primary AI decision changed." : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saved full-text source could not be reanalyzed.");
    } finally {
      setIsReanalyzingSavedSource(false);
    }
  }

  async function reanalyzeSelectedSavedSources() {
    if (analyzingRef.current) return;
    if (selectedHistoryItemsForAction.length === 0) {
      setError("Select saved article records in the article list before running AI review.");
      return;
    }
    if (selectedRunnableAiReviewerIds.length === 0) {
      setError("Select at least one ready AI reviewer model before running selected article AI review.");
      return;
    }
    const queuedItems = selectedSourceSavedHistoryItemsForAction;
    const legacyCount = selectedLegacyHistoryItemsForAction.length;
    if (queuedItems.length === 0) {
      setError(
        [
          `Selected ${selectedHistoryItemsForAction.length.toLocaleString("ko-KR")} record(s), but none have a saved full-text source.`,
          selectedLegacyArticleNumberText ? `Full-text missing article numbers: ${selectedLegacyArticleNumberText}.` : "",
          "Upload and match those PDF/Word full-text files first.",
        ]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    if (legacyCount > 0) {
      const confirmed = window.confirm(
        [
          `Run AI review on ${queuedItems.length.toLocaleString("ko-KR")} selected saved-source record(s)?`,
          `${legacyCount.toLocaleString("ko-KR")} selected legacy/no-source record(s) will be skipped because the original PDF/Word source is not stored yet.`,
          selectedLegacyArticleNumberText ? `Full-text missing article numbers: ${selectedLegacyArticleNumberText}.` : "",
          "",
          "Use batch full-text upload for those legacy records first, then rerun selected AI review.",
        ]
          .filter((line) => line !== "")
          .join("\n"),
      );
      if (!confirmed) return;
    }

    analyzingRef.current = true;
    setIsAnalyzing(true);
    setIsReanalyzingSavedSource(true);
    setError("");
    setNotice("");
    setAnalysis(null);
    setCurrentHistoryId(null);
    resetVerificationState();
    setSelectedAiReviewRun({
      selectedIds: selectedHistoryItemsForAction.map((item) => item.id),
      sourceSavedIds: queuedItems.map((item) => item.id),
    });
    setBatchResults(
      queuedItems.map((item) => ({
        id: `saved-${item.id}`,
        fileName: item.fileName,
        fileSize: 0,
        status: "pending",
        attempts: 0,
        savedRecordId: item.id,
        decision: item.decision,
        confidence: item.confidence,
        match: null,
        savedSourceRerun: true,
        message: "Waiting for selected saved-source AI review.",
      })),
    );

    try {
      const wakeLockActive = await requestBatchWakeLock();
      let reanalyzedCount = 0;
      let failedCount = 0;

      for (const [index, item] of queuedItems.entries()) {
        const resultId = `saved-${item.id}`;
        setNotice(
          [
            `Running selected AI reviewer(s) ${index + 1}/${queuedItems.length}: ${item.fileName}`,
            wakeLockActive ? "Screen wake lock is active while the browser runs the queue." : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        setBatchResults((current) =>
          current.map((result) =>
            result.id === resultId
              ? {
                  ...result,
                  status: "analyzing",
                  attempts: 1,
                  message: `Attempt 1/${batchAnalysisMaxAttempts}: running selected AI reviewers on saved full-text source.`,
                }
              : result,
          ),
        );

        try {
          const record = await reanalyzeSavedHistoryItem(item, (message) => updateBatchStage(resultId, message));
          reanalyzedCount += 1;
          setAnalysis(record.analysis);
          setCurrentHistoryId(record.id);
          setReferenceRecord(stripGeneratedReferenceContext(record.referenceRecord));
          if (record.sourceSheet) setWorksheetName(record.sourceSheet);
          applyVerification(record.verification);
          setBatchResults((current) =>
            current.map((result) =>
              result.id === resultId
                ? {
                    ...result,
                    status: "saved",
                    savedRecordId: record.id,
                    decision: record.analysis.eligibility.decision,
                    confidence: record.analysis.eligibility.confidence,
                    message: `Selected AI reviewer(s) completed and saved to the same article record. Model reviews: ${record.analysis.modelReviews.length}.`,
                  }
                : result,
            ),
          );
        } catch (caught) {
          failedCount += 1;
          setBatchResults((current) =>
            current.map((result) =>
              result.id === resultId
                ? {
                    ...result,
                    status: "failed",
                    message: caught instanceof Error ? caught.message : "Selected saved-source AI review failed.",
                  }
                : result,
            ),
          );
        }
      }

      await loadHistory();
      setNotice(
        `Selected article AI review finished. Reanalyzed ${reanalyzedCount}/${queuedItems.length} saved-source record(s); failed ${failedCount}; skipped legacy/no-source ${legacyCount}.`,
      );
      if (failedCount > 0 || legacyCount > 0) {
        setError(
          [
            `Selected article AI review completed with ${failedCount} failed record(s) and ${legacyCount} legacy/no-source skipped record(s).`,
            selectedLegacyArticleNumberText ? `Full-text missing article numbers skipped: ${selectedLegacyArticleNumberText}.` : "",
            "Check the queue details below.",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Selected saved article AI review could not be completed.");
    } finally {
      await releaseBatchWakeLock();
      analyzingRef.current = false;
      setIsAnalyzing(false);
      setIsReanalyzingSavedSource(false);
    }
  }

  async function runSavedSourceAction() {
    if (!currentHistoryItem) {
      setError("Select a saved full-text record first.");
      return;
    }
    if (selectedRunnableAiReviewerIds.length === 0) {
      setError("Select at least one ready AI reviewer model first.");
      return;
    }
    if (currentHistoryItem.sourceFileSaved) {
      await reanalyzeSavedSource();
      return;
    }
    if (!canSaveSourceToLegacyRecord) {
      setError("This legacy record needs exactly one matching full-text file selected before AI rerun.");
      return;
    }
    await saveSourceToSelectedHistory({ rerunAfterSave: true });
  }

  async function saveSourceToSelectedHistory(options: { rerunAfterSave?: boolean } = {}) {
    if (!currentHistoryId || !currentHistoryItem) {
      setError("Select the saved legacy full-text record before saving a source file.");
      return;
    }
    if (currentHistoryItem.sourceFileSaved) {
      setError("This saved full-text record already has a reusable source file.");
      return;
    }
    if (files.length !== 1 || !firstSelectedFile) {
      setError("Choose exactly one matching full-text file for the selected legacy record.");
      return;
    }
    if (options.rerunAfterSave && selectedRunnableAiReviewerIds.length === 0) {
      setError("Select at least one ready AI reviewer model before uploading a source for automatic analysis.");
      return;
    }

    const sourceFile = firstSelectedFile;
    setIsSavingSourceToHistory(true);
    setError("");
    setNotice("Saving the selected source file to this legacy full-text record.");
    try {
      let payload: { record: MetaFullTextHistoryRecord };
      if (shouldUseLargeFileUpload(sourceFile)) {
        setNotice("Uploading the large source file through the server chunk path.");
        const session = await readUploadSessionPayload(
          await fetchWithTimeoutAndRetry(
            "/api/meta-analysis/full-text/upload-session",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: sourceFile.name,
                mimeType: sourceFile.type || "application/octet-stream",
                fileSize: sourceFile.size,
              }),
            },
            {
              label: `Large-file upload session for ${sourceFile.name}`,
              timeoutMs: fullTextUploadSessionTimeoutMs,
              attempts: longRequestMaxAttempts,
              onRetry: setNotice,
            },
          ),
        );
        const driveFile = await uploadLargeFileThroughServerChunks(sourceFile, session, (message) => setNotice(message));
        payload = await readHistoryRecordPayload(
          await fetchWithTimeoutAndRetry(
            fullTextHistoryRecordUrl(currentHistoryId, projectId, "source"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                driveFileId: driveFile.id,
                fileName: driveFile.name || sourceFile.name,
                mimeType: driveFile.mimeType || sourceFile.type || "application/octet-stream",
                fileSize: Number(driveFile.size) || sourceFile.size,
              }),
            },
            {
              label: `Saving source metadata for ${sourceFile.name}`,
              timeoutMs: fullTextUploadSessionTimeoutMs,
              attempts: longRequestMaxAttempts,
              onRetry: setNotice,
            },
          ),
        );
      } else {
        const formData = new FormData();
        formData.set("file", sourceFile);
        formData.set("projectId", projectId);
        payload = await readHistoryRecordPayload(
          await fetchWithTimeoutAndRetry(
            fullTextHistoryRecordUrl(currentHistoryId, projectId, "source"),
            {
              method: "POST",
              body: formData,
            },
            {
              label: `Saving source file for ${sourceFile.name}`,
              timeoutMs: fullTextUploadSessionTimeoutMs,
              attempts: longRequestMaxAttempts,
              onRetry: setNotice,
            },
          ),
        );
      }

      const record = payload.record;
      setAnalysis(record.analysis);
      setCurrentHistoryId(record.id);
      setReferenceRecord(stripGeneratedReferenceContext(record.referenceRecord));
      if (record.sourceSheet) setWorksheetName(record.sourceSheet);
      applyVerification(record.verification);
      const overview = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(overview);
      setFiles([]);
      setBatchResults([]);
      if (options.rerunAfterSave) {
        setNotice(`Source saved to legacy record: ${record.fileName}. Running selected AI reviewers now.`);
        await reanalyzeSavedSource();
        return;
      }
      setNotice(
        `Source saved to legacy record: ${record.fileName}. You can now run the selected AI reviewers on the saved full text without reuploading.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Full-text source could not be saved to this record.");
      setNotice("");
    } finally {
      setIsSavingSourceToHistory(false);
    }
  }

  function handleFilesChange(nextFiles: File[]) {
    if (nextFiles.length === 0) return;
    const mergedFiles = mergeSelectedFiles(files, nextFiles);
    const addedCount = Math.max(0, mergedFiles.length - files.length);
    setFiles(mergedFiles);
    setBatchResults(
      mergedFiles.map((nextFile, index) => ({
        id: batchFileId(nextFile, index),
        fileName: nextFile.name,
        fileSize: nextFile.size,
        status: "pending",
        attempts: 0,
        savedRecordId: null,
        decision: null,
        confidence: null,
        match: batchMatchForFile(nextFile, historyItems),
        message: "Waiting for sequential analysis.",
      })),
    );
    if (!currentHistoryId) {
      setAnalysis(null);
      resetVerificationState();
    }
    setError("");
    setNotice(
      `Selected full-text files updated: ${mergedFiles.length.toLocaleString("ko-KR")} total${
        addedCount > 0 ? `; ${addedCount.toLocaleString("ko-KR")} newly added` : "; no new files added"
      }.`,
    );
  }

  function clearSelectedFiles() {
    setFiles([]);
    setBatchResults([]);
    setError("");
    setNotice("Selected full-text files cleared.");
  }

  async function requestBatchWakeLock() {
    const wakeLock = typeof navigator === "undefined" ? null : (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return false;
    try {
      batchWakeLockRef.current = await wakeLock.request("screen");
      return true;
    } catch {
      return false;
    }
  }

  async function releaseBatchWakeLock() {
    const currentWakeLock = batchWakeLockRef.current;
    batchWakeLockRef.current = null;
    if (!currentWakeLock) return;
    await currentWakeLock.release().catch(() => undefined);
  }

  function updateBatchStage(resultId: string, message: string) {
    const retryAttempt = /retrying\s+(\d+)\/\d+/i.exec(message);
    const attempts = retryAttempt ? Number(retryAttempt[1]) : null;
    setBatchResults((current) =>
      current.map((item) =>
        item.id === resultId
          ? {
              ...item,
              attempts: attempts !== null && Number.isFinite(attempts) ? Math.max(item.attempts, attempts) : item.attempts,
              message,
            }
          : item,
      ),
    );
  }

  async function copyToClipboard(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setError("");
      setNotice(`${label} copied to clipboard. This is not saved.`);
    } catch {
      setNotice("");
      setError("클립보드 복사에 실패했습니다. 브라우저 권한을 확인하거나 CSV를 다시 생성해 주세요.");
    }
  }

  function createAnalysisFormData(
    nextFile: File,
    duplicateTarget: MetaFullTextHistorySummary | null,
    unmatchedPolicy: "save_new" | "skip_new",
  ) {
    const formData = new FormData();
    const cleanedReferenceRecord = stripGeneratedReferenceContext(referenceRecord);
    formData.set("file", nextFile);
    formData.set("projectId", projectId);
    formData.set(
      "referenceRecord",
      [
        selectedWorksheet
          ? `Excel source sheet: ${selectedWorksheet.sheetName} (${selectedWorksheet.label}); review mode: ${selectedWorksheet.reviewMode}`
          : "",
        cleanedReferenceRecord,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    formData.set("extractionColumns", extractionColumns.join(","));
    formData.set("sourceSheet", selectedWorksheet?.sheetName ?? "");
    formData.set("sourceLabel", selectedWorksheet?.label ?? "");
    formData.set("reviewMode", selectedWorksheet?.reviewMode ?? "");
    formData.set("reviewerOneName", reviewerOneName);
    formData.set("reviewerTwoName", reviewerTwoName);
    formData.set("reviewerIds", selectedRunnableAiReviewerIds.join(","));
    formData.set("researcherGuidance", normalizeMetaFullTextResearcherGuidance(researcherAiGuidance));
    formData.set("duplicatePolicy", duplicateTarget || unmatchedPolicy === "skip_new" ? "merge" : "new");
    if (duplicateTarget) formData.set("duplicateTargetId", duplicateTarget.id);
    formData.set("unmatchedPolicy", unmatchedPolicy);
    return formData;
  }

  function createAnalysisJsonPayload(
    nextFile: File,
    driveFile: GoogleDriveUploadPayload,
    duplicateTarget: MetaFullTextHistorySummary | null,
    unmatchedPolicy: "save_new" | "skip_new",
  ) {
    const cleanedReferenceRecord = stripGeneratedReferenceContext(referenceRecord);
    const driveSize = Number(driveFile.size);
    return {
      driveFileId: driveFile.id,
      fileName: driveFile.name || nextFile.name,
      mimeType: driveFile.mimeType || nextFile.type || "application/octet-stream",
      fileSize: Number.isFinite(driveSize) && driveSize > 0 ? driveSize : nextFile.size,
      projectId,
      referenceRecord: [
        selectedWorksheet
          ? `Excel source sheet: ${selectedWorksheet.sheetName} (${selectedWorksheet.label}); review mode: ${selectedWorksheet.reviewMode}`
          : "",
        cleanedReferenceRecord,
      ]
        .filter(Boolean)
        .join("\n"),
      extractionColumns,
      sourceSheet: selectedWorksheet?.sheetName ?? "",
      sourceLabel: selectedWorksheet?.label ?? "",
      reviewMode: selectedWorksheet?.reviewMode ?? "",
      reviewerOneName,
      reviewerTwoName,
      reviewerIds: selectedRunnableAiReviewerIds,
      researcherGuidance: normalizeMetaFullTextResearcherGuidance(researcherAiGuidance),
      duplicatePolicy: duplicateTarget || unmatchedPolicy === "skip_new" ? "merge" : "new",
      duplicateTargetId: duplicateTarget?.id ?? null,
      unmatchedPolicy,
    };
  }

  function shouldUseLargeFileUpload(nextFile: File) {
    return nextFile.size > largeFileUploadThresholdBytes;
  }

  async function analyzeSingleFullTextFile(
    nextFile: File,
    onStage: (message: string) => void,
    duplicateTarget: MetaFullTextHistorySummary | null,
    unmatchedPolicy: "save_new" | "skip_new",
  ) {
    if (!shouldUseLargeFileUpload(nextFile)) {
      onStage(
        duplicateTarget
          ? `Extracting full text and merging AI review into existing record: ${duplicateTarget.fileName}.`
          : "Extracting full text and requesting AI review.",
      );
      return readAnalysisPayload(
        await fetchWithTimeoutAndRetry(
          "/api/meta-analysis/full-text/analyze",
          {
            method: "POST",
            body: createAnalysisFormData(nextFile, duplicateTarget, unmatchedPolicy),
          },
          {
            label: `Full-text analysis for ${nextFile.name}`,
            timeoutMs: fullTextAnalysisRequestTimeoutMs,
            attempts: longRequestMaxAttempts,
            onRetry: onStage,
          },
        ),
      );
    }

    onStage("Creating a Google Drive resumable upload session for this large file.");
    const session = await readUploadSessionPayload(
      await fetchWithTimeoutAndRetry(
        "/api/meta-analysis/full-text/upload-session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: nextFile.name,
            mimeType: nextFile.type || "application/octet-stream",
            fileSize: nextFile.size,
          }),
        },
        {
          label: `Large-file upload session for ${nextFile.name}`,
          timeoutMs: fullTextUploadSessionTimeoutMs,
          attempts: batchAnalysisMaxAttempts,
          onRetry: onStage,
        },
      ),
    );

    const driveFile = await uploadLargeFileThroughServerChunks(nextFile, session, onStage);

    onStage("Analyzing the uploaded full text from Google Drive.");
    return readAnalysisPayload(
      await fetchWithTimeoutAndRetry(
        "/api/meta-analysis/full-text/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createAnalysisJsonPayload(nextFile, driveFile, duplicateTarget, unmatchedPolicy)),
        },
        {
          label: `Full-text analysis from saved upload for ${nextFile.name}`,
          timeoutMs: fullTextAnalysisRequestTimeoutMs,
          attempts: batchAnalysisMaxAttempts,
          onRetry: onStage,
        },
      ),
    );
  }

  async function analyzeFullText() {
    if (analyzingRef.current || files.length === 0) return;
    if (selectedRunnableAiReviewerIds.length === 0) {
      setError("Select at least one ready AI reviewer model before full-text analysis.");
      return;
    }
    const queuedFiles = files;
    const duplicateMatches = queuedFiles
      .map((file, index) => ({
        file,
        resultId: batchFileId(file, index),
        target: findDuplicateHistoryItemForFile(file, historyItems),
      }))
      .filter((item): item is { file: File; resultId: string; target: MetaFullTextHistorySummary } => Boolean(item.target));
    const duplicateTargetByResultId = new Map<string, MetaFullTextHistorySummary>();
    const unmatchedPolicy: "save_new" | "skip_new" = preventUnmatchedNewRecords ? "skip_new" : "save_new";
    if (duplicateMatches.length > 0 && preventUnmatchedNewRecords) {
      const confirmed = window.confirm(duplicateMergePrompt(duplicateMatches));
      if (!confirmed) {
        setNotice("Matched-record update canceled. Turn off update-matched-only mode to save these uploads as new article records.");
        return;
      }
      for (const match of duplicateMatches) duplicateTargetByResultId.set(match.resultId, match.target);
    }

    if (currentHistoryItem && duplicateMatches.length === 0) {
      const confirmed = window.confirm(
        preventUnmatchedNewRecords
          ? "A saved record is selected, but the batch upload path will auto-match each uploaded file to its own existing record. Files that cannot be matched will not be saved as new records while existing-only mode is checked."
          : "A saved record is selected, but unmatched files can still be saved as NEW saved article record(s). To update only the selected record without duplication, cancel this and use the saved-record update button.",
      );
      if (!confirmed) return;
    } else if (
      !currentHistoryItem &&
      duplicateMatches.length === 0 &&
      historyDecisionCounts.legacy_source > 0 &&
      preventUnmatchedNewRecords
    ) {
      const confirmed = window.confirm(
        "No saved record is selected. Update-matched-only mode is checked, so unmatched uploaded files will NOT be saved as new article records. Turn this mode off when adding new articles.",
      );
      if (!confirmed) return;
    }
    analyzingRef.current = true;
    setError("");
    setNotice("");
    setIsAnalyzing(true);
    setAnalysis(null);
    setCurrentHistoryId(null);
    resetVerificationState();
    setBatchResults(
      queuedFiles.map((nextFile, index) => ({
        id: batchFileId(nextFile, index),
        fileName: nextFile.name,
        fileSize: nextFile.size,
        status: "pending",
        attempts: 0,
        savedRecordId: null,
        decision: null,
        confidence: null,
        match: batchMatchForFile(nextFile, historyItems),
        message: "Waiting for sequential analysis.",
      })),
    );
    try {
      const wakeLockActive = await requestBatchWakeLock();
      let savedCount = 0;
      let analyzedNotSavedCount = 0;
      let failedCount = 0;

      for (const [index, nextFile] of queuedFiles.entries()) {
        const resultId = batchFileId(nextFile, index);
        setNotice(
          [
            `Analyzing ${index + 1}/${queuedFiles.length}: ${nextFile.name}`,
            wakeLockActive ? "Screen wake lock is active while the browser runs the queue." : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        setBatchResults((current) =>
          current.map((item) =>
            item.id === resultId
              ? {
                  ...item,
                  status: "analyzing",
                  attempts: 1,
                  message: shouldUseLargeFileUpload(nextFile)
                    ? `Attempt 1/${batchAnalysisMaxAttempts}: preparing server chunk upload for this large file.`
                    : `Attempt 1/${batchAnalysisMaxAttempts}: extracting full text and requesting AI review.`,
                }
              : item,
          ),
        );

        try {
          const duplicateTarget = duplicateTargetByResultId.get(resultId) ?? null;
          const payload = await analyzeSingleFullTextFile(
            nextFile,
            (message) => updateBatchStage(resultId, message),
            duplicateTarget,
            unmatchedPolicy,
          );
          setAnalysis(payload.analysis);
          if (payload.savedRecord && !payload.saveError) {
            savedCount += 1;
            setCurrentHistoryId(payload.savedRecord.id);
            upsertHistoryItem(payload.savedRecord);
            const merged = payload.duplicateAction?.status === "merged";
            setBatchResults((current) =>
              current.map((item) =>
                item.id === resultId
                  ? {
                      ...item,
                      status: "saved",
                      savedRecordId: payload.savedRecord?.id ?? null,
                      decision: payload.analysis.eligibility.decision,
                      confidence: payload.analysis.eligibility.confidence,
                      message: merged
                        ? `Merged into existing full-text history record; no duplicate article was created${
                            payload.duplicateAction?.matchedBy ? ` (matched by ${payload.duplicateAction.matchedBy})` : ""
                          }.`
                        : "Saved automatically to full-text history.",
                    }
                  : item,
              ),
            );
          } else {
            analyzedNotSavedCount += 1;
            setCurrentHistoryId(null);
            setBatchResults((current) =>
              current.map((item) =>
                item.id === resultId
                  ? {
                      ...item,
                      status: "analyzed_not_saved",
                      decision: payload.analysis.eligibility.decision,
                      confidence: payload.analysis.eligibility.confidence,
                      message: payload.saveError
                        ? savedErrorMessage(payload.saveError)
                        : "Analysis finished, but no saved history record was returned.",
                    }
                  : item,
              ),
            );
          }
        } catch (caught) {
          failedCount += 1;
          setBatchResults((current) =>
            current.map((item) =>
              item.id === resultId
                ? {
                    ...item,
                    status: "failed",
                    message: caught instanceof Error ? caught.message : "full-text analysis failed.",
                  }
                : item,
            ),
          );
        }
      }

      await loadHistory();
      setNotice(
        `Batch analysis finished. Saved ${savedCount}/${queuedFiles.length} files; analyzed but not saved ${analyzedNotSavedCount}; failed ${failedCount}. Open saved records to verify each result.`,
      );
      if (failedCount > 0 || analyzedNotSavedCount > 0) {
        setError(
          `Batch analysis completed with ${failedCount} failed file(s) and ${analyzedNotSavedCount} analyzed-not-saved file(s). Check the batch queue details below.`,
        );
      } else {
        setError("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "full-text 분석에 실패했습니다.");
    } finally {
      await releaseBatchWakeLock();
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }

  const title =
    focus === "screening"
      ? "Full-text article AI eligibility assistant"
      : "Full-text article AI extraction assistant";
  const detail =
    focus === "screening"
      ? "확보한 full-text PDF 또는 Word 파일을 올리면 관찰연구 여부, 악기/부위/denominator 추출 가능성, 제외 사유를 먼저 판정합니다."
      : "PDF 또는 Word 파일에서 엑셀 템플릿에 맞는 parameter 초안을 만들고, n/total 오류와 누락 필드를 연구자가 검증하도록 표시합니다.";

  return (
    <section className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50 p-2 sm:p-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">{title}</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-950 sm:text-lg">원문 업로드 → AI 초안 → 검증</h3>
          <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-zinc-700 sm:block">{detail}</p>
        </div>
      </div>

      <details className="mt-3 rounded-md border border-emerald-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
          Reviewer names / verification status
        </summary>
        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
              reviewer 1 name
              <input
                value={reviewerOneName}
                onChange={(event) => {
                  setReviewerOneName(event.target.value);
                  setReviewerNamesSaved(false);
                }}
                placeholder="Reviewer 1"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case text-zinc-900 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
              reviewer 2 name
              <input
                value={reviewerTwoName}
                onChange={(event) => {
                  setReviewerTwoName(event.target.value);
                  setReviewerNamesSaved(false);
                }}
                placeholder="Reviewer 2"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case text-zinc-900 outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void saveReviewerSettings()}
            disabled={isSavingReviewerSettings || !reviewerOneName.trim() || !reviewerTwoName.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSavingReviewerSettings ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {reviewerNamesSaved ? "Reviewer names saved" : "Save reviewer names"}
          </button>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
          Reviewer names: {reviewerNamesSaved ? "saved" : "not saved"}
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
          Saved files: {historyStats.totalCount} · Verification completed: {historyStats.verificationCompletedCount}
        </p>
        {!reviewerSettingsReady ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
            Reviewer names are not required to run AI full-text analysis. Save them before final human verification or PI adjudication.
          </p>
        ) : null}
      </details>

      <details className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
          AI reviewer setup / source status
        </summary>
        <div className="mt-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-950">AI model reviewers for this run</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Select the AI engines to run on uploaded or already-saved full-text source files. Saved-source runs add or replace only those model drafts in the comparison table.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAiReviewerSettings()}
            disabled={aiSettingsLoading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${aiSettingsLoading ? "animate-spin" : ""}`} aria-hidden />
            Refresh AI slots
          </button>
        </div>
        {aiSettingsError ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
            {aiSettingsError}
          </div>
        ) : null}
        <div className="mt-3 grid gap-2 xl:grid-cols-3">
          {aiReviewerSlots.length ? (
            aiReviewerSlots.map((slot) => {
              const runnable = aiReviewerRunnable(slot);
              const selected = selectedAiReviewerIds.includes(slot.id);
              return (
                <label
                  key={slot.id}
                  className={`grid gap-2 rounded-md border p-3 text-sm ${
                    runnable ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected && runnable}
                        disabled={!runnable}
                        onChange={(event) => toggleAiReviewerSelection(slot.id, event.target.checked)}
                        className="mt-1 h-4 w-4 accent-emerald-700 disabled:opacity-40"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-zinc-950">{slot.label}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-zinc-700">{aiReviewerModelDisplay(slot)}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${runnable ? "bg-white text-emerald-800 ring-1 ring-emerald-200" : "bg-white text-zinc-500 ring-1 ring-zinc-200"}`}>
                      {aiReviewerStatus(slot)}
                    </span>
                  </span>
                  <span className="text-xs leading-5 text-zinc-600">
                    {slot.providerType}
                    {slot.baseUrl ? ` · ${slot.baseUrl}` : ""}
                    {slot.apiKeySource !== "missing" ? ` · key ${slot.apiKeySource}` : " · no key"}
                  </span>
                </label>
              );
            })
          ) : (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold text-zinc-600">
              No AI reviewer slots loaded. Open AI settings, save at least one reviewer, then refresh.
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold leading-5 text-zinc-700">
            Selected runnable reviewer(s): {selectedAiReviewerLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedAiReviewerIds(runnableAiReviewerSlots.map((slot) => slot.id))}
              disabled={runnableAiReviewerSlots.length === 0}
              className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Select all ready
            </button>
            {currentHistoryItem && !currentHistoryItem.sourceFileSaved ? (
              <button
                type="button"
                onClick={() => void saveSourceToSelectedHistory({ rerunAfterSave: true })}
                disabled={!canUpgradeLegacyRecordWithAi}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
              >
                {isSavingSourceToHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                Save source and run AI reviewers
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void runSavedSourceAction()}
              disabled={savedSourceActionDisabled}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isReanalyzingSavedSource || isSavingSourceToHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              {savedSourceActionLabel}
            </button>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
          <span className="block text-sm text-amber-950">
            원문 full-text 파일 저장 상태: legacy/no source {historyDecisionCounts.legacy_source.toLocaleString("ko-KR")}개는 PDF/Word 원문이 저장되어 있지 않습니다.
          </span>
          <span className="mt-1 block text-amber-900">
            여러 PDF/Word 원문을 한꺼번에 선택하면 앱이 기존 저장 논문과 자동 매칭하고, 매칭된 record에 source를 저장한 뒤 선택한 AI reviewer들을 순차 실행합니다.
          </span>
          Existing GPT-5-nano legacy rerun: select many full-text files once, keep existing-only mode checked, and run the batch queue. Use one-record manual update only for files that cannot be confidently matched.
          <span className="mt-1 block text-amber-900">Current button action: {savedSourceActionLabel}.</span>
          <span className="mt-1 block text-amber-900">{savedSourceActionHelp}</span>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
            {currentHistoryItem?.sourceFileSaved
              ? `Selected saved source: ${currentHistoryItem.fileName}`
              : currentHistoryItem
              ? "This selected record is legacy/no source. Choose the matching full-text file below; the app saves it to this record and immediately runs the selected AI reviewers."
              : "Select a saved full-text record below, then run the checked AI reviewers without reuploading the file."}
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-zinc-700">
          AI comparison progress: {aiComparisonProgress.complete}/{historyItems.length} saved records have{" "}
          {aiComparisonProgress.target} AI model review(s). Saved-source records needing rerun:{" "}
          {aiComparisonProgress.savedSourceNeedsRun}; legacy records needing source upload: {aiComparisonProgress.uploadNeeded}.
        </p>
        </div>
      </details>
      <details className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
          Advanced full-text upload fields
        </summary>
      <div className="mt-3 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <label className="grid gap-2 text-sm font-semibold text-zinc-700">
          full-text 파일
          <div className="rounded-md border border-dashed border-emerald-300 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <UploadCloud className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-950">{selectedFileLabel}</p>
                <p className="mt-1 text-xs font-medium text-zinc-500">{selectedFileDetail}</p>
              </div>
            </div>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => {
                handleFilesChange(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
              disabled={isAnalyzing}
              className="mt-3 w-full text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
            />
            {files.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold leading-5 text-zinc-700">
                  누적 선택: {files.length.toLocaleString("ko-KR")}개 파일. `파일 선택`을 다시 눌러도 기존 선택은 유지되고 새 파일만 추가됩니다.
                </p>
                <button
                  type="button"
                  onClick={clearSelectedFiles}
                  disabled={isAnalyzing}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear selected files
                </button>
              </div>
            ) : null}
            <label className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
              <input
                type="checkbox"
                checked={batchExistingOnlyMode}
                onChange={(event) => setBatchExistingOnlyMode(event.target.checked)}
                disabled={isAnalyzing}
                className="mt-1 h-4 w-4 shrink-0 accent-amber-700 disabled:opacity-40"
              />
              <span>
                기존 record만 업데이트: 특수한 경우에만 켭니다. 켜면 매칭된 파일만 기존 record에 병합하고,
                매칭 실패 파일은 새 논문으로 저장하지 않습니다. 새 article 추가가 기본 작업이면 이 옵션을 끕니다.
              </span>
            </label>
            {files.length > 0 ? (
              <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs font-semibold leading-5 text-zinc-700">
                Batch match preview: {batchAutoMatchCount.toLocaleString("ko-KR")}/{files.length.toLocaleString("ko-KR")} file(s)
                matched to saved records; unmatched {batchUnmatchedCount.toLocaleString("ko-KR")}. AI reviewer run:{" "}
                {selectedAiReviewerLabel}.
              </div>
            ) : null}
            {currentHistoryItem && !currentHistoryItem.sourceFileSaved ? (
              <button
                type="button"
                onClick={() => void saveSourceToSelectedHistory({ rerunAfterSave: true })}
                disabled={!canUpgradeLegacyRecordWithAi}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                {isSavingSourceToHistory ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Save this file and run selected AI reviewers
              </button>
            ) : null}
            <button
              type="button"
              onClick={analyzeFullText}
              disabled={
                isAnalyzing ||
                files.length === 0 ||
                selectedRunnableAiReviewerIds.length === 0 ||
                Boolean(currentHistoryItem && !currentHistoryItem.sourceFileSaved && files.length === 1)
              }
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="h-4 w-4" aria-hidden />}
              {analyzeButtonLabel}
            </button>
            <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
              Select multiple PDF, Word, TXT, or MD files once. By default, unmatched files are saved as NEW article records. Turn on update-matched-only mode only when you intentionally want to prevent new records.
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
              AI reviewer run: {selectedAiReviewerLabel}
            </p>
            {!currentHistoryItem && files.length > 0 ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
                {preventUnmatchedNewRecords
                  ? "No saved record is selected. Update-matched-only mode is ON, so unmatched full-text files will not be saved as new articles."
                  : "No saved record is selected. This is the normal add-new workflow: unmatched full-text files will be saved as new article records."}
              </p>
            ) : null}
            {currentHistoryItem && !currentHistoryItem.sourceFileSaved ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
                This saved result was created before source-file persistence. Select exactly one matching full-text file, then use the saved-record update button. The source and selected AI reviewer results are written back to this same record, not saved as another article.
              </p>
            ) : null}
            {currentHistoryItem?.sourceFileSaved && files.length > 0 ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
                A saved record is selected, but this upload button still creates a NEW saved article record. To re-run AI on the selected article without duplication, clear the upload or use the saved-record update button above.
              </p>
            ) : null}
          </div>
        </label>

        <div className="grid gap-3">
          {worksheetOptions.length > 0 ? (
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Excel source sheet
              <select
                value={worksheetName}
                onChange={(event) => setWorksheetName(event.target.value)}
                className="h-10 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-emerald-500"
              >
                {worksheetOptions.map((worksheet) => (
                  <option key={worksheet.sheetName} value={worksheet.sheetName}>
                    {worksheet.sheetName} · {worksheet.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedWorksheet?.reviewMode === "cautious" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
              Manual_FullText_Check는 AI 판정을 낮은 신뢰도의 초안으로 보고, 원문 table/figure/supplement와 exclusion reason을 더 엄격히 확인합니다.
            </div>
          ) : null}
          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            엑셀 screening row 또는 논문 정보
            <textarea
              value={referenceRecord}
              onChange={(event) => setReferenceRecord(stripGeneratedReferenceContext(event.target.value))}
              rows={6}
              placeholder="Screening_ID, first author, year, title, DOI, PMID, abstract 등을 엑셀에서 한 행 복사해 붙여 넣으세요."
              className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-800 outline-none focus:border-emerald-500"
            />
          </label>
        </div>
      </div>
      </details>

      <section className="mt-3 min-w-0 rounded-md border border-emerald-200 bg-white p-2 sm:p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-700" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-zinc-950">Saved AI review article list</p>
              <p className="mt-0.5 hidden text-xs font-medium leading-5 text-zinc-500 sm:block">
                목록은 논문 번호와 제목만 먼저 보여줍니다. 행을 선택하면 파일명, 저장소, AI review, reviewer 상태가 아래에 열립니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
        {historyError ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
            {historyError}
          </div>
        ) : null}
        <div className="mt-3 min-w-0 rounded-md border border-emerald-200 bg-white p-2 sm:p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                full-text PDF/Word
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(event) => {
                    handleFilesChange(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                  disabled={isAnalyzing}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm normal-case text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
              </label>
              <button
                type="button"
                onClick={analyzeFullText}
                disabled={
                  isAnalyzing ||
                  files.length === 0 ||
                  selectedRunnableAiReviewerIds.length === 0 ||
                  Boolean(currentHistoryItem && !currentHistoryItem.sourceFileSaved && files.length === 1)
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                title={analyzeButtonLabel}
              >
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="h-4 w-4" aria-hidden />}
                Analyze
              </button>
              <button
                type="button"
                onClick={clearSelectedFiles}
                disabled={isAnalyzing || files.length === 0}
                className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear files
              </button>
            </div>
            <div className="min-w-0 break-words rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold leading-5 text-zinc-700 xl:max-w-md">
              {selectedFileLabel} · {selectedFileDetail} · matched {batchAutoMatchCount.toLocaleString("ko-KR")}/
              {files.length.toLocaleString("ko-KR")} · AI {selectedAiReviewerLabel}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
              <input
                type="checkbox"
                checked={batchExistingOnlyMode}
                onChange={(event) => setBatchExistingOnlyMode(event.target.checked)}
                disabled={isAnalyzing}
                className="h-4 w-4 shrink-0 accent-amber-700 disabled:opacity-40"
              />
              Update matched existing only
            </label>
            <span className="text-xs font-semibold leading-5 text-zinc-600">
              기본값: 매칭되지 않은 full-text는 새 article record로 저장합니다.
            </span>
            {worksheetOptions.length > 0 ? (
              <select
                value={worksheetName}
                onChange={(event) => setWorksheetName(event.target.value)}
                className="h-9 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 outline-none focus:border-emerald-500 sm:w-auto sm:min-w-64"
                aria-label="Excel source sheet"
              >
                {worksheetOptions.map((worksheet) => (
                  <option key={worksheet.sheetName} value={worksheet.sheetName}>
                    {worksheet.sheetName} · {worksheet.label}
                  </option>
                ))}
              </select>
            ) : null}
            {currentHistoryItem && !currentHistoryItem.sourceFileSaved ? (
              <button
                type="button"
                onClick={() => void saveSourceToSelectedHistory({ rerunAfterSave: true })}
                disabled={!canUpgradeLegacyRecordWithAi}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                {isSavingSourceToHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                Save source + run
              </button>
            ) : null}
          </div>
          <details className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
              Excel row / AI judgment guide
            </summary>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                Excel screening row or article info
                <textarea
                  value={referenceRecord}
                  onChange={(event) => setReferenceRecord(stripGeneratedReferenceContext(event.target.value))}
                  rows={5}
                  placeholder="Screening_ID, first author, year, title, DOI, PMID, abstract"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-800 outline-none focus:border-emerald-500"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                AI judgment guide for this run
                <textarea
                  value={researcherAiGuidance}
                  onChange={(event) => setResearcherAiGuidance(event.target.value)}
                  rows={8}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs font-normal normal-case leading-5 text-zinc-800 outline-none focus:border-emerald-500"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setResearcherAiGuidance(defaultMetaFullTextResearcherGuidance)}
                disabled={isAnalyzing}
                className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset guide
              </button>
              <span className="text-xs font-semibold leading-8 text-zinc-500">
                This exact guide is sent to every selected AI reviewer for upload and saved-source rerun.
              </span>
            </div>
          </details>
        </div>
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-950">AI model reviewers for selected articles</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-zinc-600">
                아래 Article list에서 체크한 논문 중 full-text source가 저장된 record는 선택한 AI reviewer로 바로 다시 분석합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAiReviewerSettings()}
              disabled={aiSettingsLoading}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${aiSettingsLoading ? "animate-spin" : ""}`} aria-hidden />
              Refresh AI slots
            </button>
          </div>
          {aiSettingsError ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
              {aiSettingsError}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {aiReviewerSlots.length ? (
              aiReviewerSlots.map((slot) => {
                const runnable = aiReviewerRunnable(slot);
                const selected = selectedAiReviewerIds.includes(slot.id);
                return (
                  <label
                    key={slot.id}
                    className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 ${
                      runnable ? "border-emerald-300 bg-white text-zinc-800" : "border-zinc-200 bg-zinc-50 text-zinc-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected && runnable}
                      disabled={!runnable || isAnalyzing}
                      onChange={(event) => toggleAiReviewerSelection(slot.id, event.target.checked)}
                      className="h-4 w-4 shrink-0 accent-emerald-700 disabled:opacity-40"
                    />
                    <span className="min-w-0 truncate">
                      {slot.label}: {aiReviewerModelDisplay(slot)}
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="rounded-md border border-zinc-200 bg-white p-2 text-xs font-semibold text-zinc-600">
                AI reviewer slots are not loaded. Refresh AI slots or open AI settings.
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-emerald-200 bg-white p-2 sm:p-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid gap-1">
              <p className="text-xs font-semibold leading-5 text-zinc-700">
                Selected {selectedHistoryItemsForAction.length.toLocaleString("ko-KR")} · ready{" "}
                {selectedSourceSavedHistoryItemsForAction.length.toLocaleString("ko-KR")} · full-text missing{" "}
                {selectedLegacyHistoryItemsForAction.length.toLocaleString("ko-KR")} · completed {selectedArticleAiReviewProgressLabel} · reviewers:{" "}
                {selectedAiReviewerLabel}
              </p>
              <p className="hidden text-xs font-semibold leading-5 text-emerald-800 sm:block">
                JBI RoB target: primary quantitative included {historyDecisionCounts.primary_quantitative_included.toLocaleString("ko-KR")} ·
                source saved {historyDecisionCounts.primary_quantitative_source_saved.toLocaleString("ko-KR")} · upload needed{" "}
                {historyDecisionCounts.primary_quantitative_missing_source.toLocaleString("ko-KR")}
              </p>
              {selectedLegacyArticleNumberText ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold leading-5 text-amber-950">
                  선택 항목 중 full-text 없음: {selectedLegacyArticleNumberText}. 이 번호는 PDF/Word source 업로드 후 AI review를 실행합니다.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedAiReviewerIds(runnableAiReviewerSlots.map((slot) => slot.id))}
                disabled={runnableAiReviewerSlots.length === 0 || isAnalyzing}
                className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Select all ready
              </button>
              <button
                type="button"
                onClick={prepareRiskOfBiasReanalysisSelection}
                disabled={primaryQuantitativeIncludedSourceSavedHistoryItems.length === 0 || isAnalyzing}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 sm:px-3"
                title="Prepare JBI RoB rerun"
              >
                <SearchCheck className="h-3.5 w-3.5" aria-hidden />
                JBI rerun
              </button>
              <button
                type="button"
                onClick={() => void reanalyzeSelectedSavedSources()}
                disabled={selectedHistoryAiReviewDisabled}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-700 px-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400 sm:px-3"
                title={`Run AI review on selected (${selectedArticleAiReviewProgressLabel})`}
              >
                {isReanalyzingSavedSource || isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                Run AI ({selectedArticleAiReviewProgressLabel})
              </button>
            </div>
          </div>
        </div>
        {historyDecisionCounts.legacy_source > 0 ? (
          <details className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">
            <summary className="cursor-pointer">
              Full-text missing {historyDecisionCounts.legacy_source.toLocaleString("ko-KR")}개
            </summary>
            <p className="mt-2 text-xs leading-5 text-amber-900">
              이 기록들은 이전 AI 분석 결과만 저장되어 있고 원문 PDF/Word source가 저장되어 있지 않습니다. 새 AI model을 적용하려면 해당 논문 번호의 full-text를 업로드해 기존 record와 매칭한 뒤 실행합니다.
            </p>
          </details>
        ) : null}
        {historySheetProgress.length > 0 ? (
          <details className="mt-3 rounded-md border border-zinc-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase text-zinc-500">
              Sheet progress
            </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2">Excel source sheet</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Saved</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Human verified</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Human include</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Human exclude</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Pending/conflict</th>
                </tr>
              </thead>
              <tbody>
                {historySheetProgress.map((row) => (
                  <tr key={row.label}>
                    <td className="border-b border-zinc-100 px-3 py-2 font-semibold text-zinc-950">{row.label}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{row.saved.toLocaleString("ko-KR")}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{row.verified.toLocaleString("ko-KR")}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-emerald-800">{row.humanInclude.toLocaleString("ko-KR")}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-rose-800">{row.humanExclude.toLocaleString("ko-KR")}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-amber-800">{(row.pending + row.conflict).toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </details>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {([
            ["include_quantitative", "정량분석후보", historyDecisionCounts.include_quantitative],
            ["uncertain", "판정보류", historyDecisionCounts.uncertain],
            ["exclude", "제외후보", historyDecisionCounts.exclude],
            ["include_narrative_support", "서술/근거후보", historyDecisionCounts.include_narrative_support],
          ] as const).map(([filter, label, count]) => (
            <button
              key={filter}
              type="button"
              onClick={() => setHistoryFilter(filter)}
              className={`rounded-md border p-2 text-left transition sm:p-3 ${
                historyFilter === filter
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50"
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase leading-4 text-zinc-500 sm:text-xs">{label}</span>
              <span className="mt-1 block text-xl font-semibold text-zinc-950 sm:text-2xl">{count.toLocaleString("ko-KR")}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ["all", `All saved ${historyDecisionCounts.all}`],
            ["primary_quantitative_included", `Quantitative included ${historyDecisionCounts.primary_quantitative_included}`],
            ["legacy_source", `Full-text missing ${historyDecisionCounts.legacy_source}`],
            ["verification_pending", `Verification pending ${historyDecisionCounts.verification_pending}`],
            ["verification_complete", `Verified ${historyDecisionCounts.verification_complete}`],
          ] as const).map(([filter, label]) => (
            <button
              key={filter}
              type="button"
              onClick={() => setHistoryFilter(filter)}
              className={`inline-flex h-8 items-center rounded-md px-2 text-xs font-semibold transition ${
                historyFilter === filter
                  ? "bg-emerald-700 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2">
          {historyItems.length > 0 ? (
            <>
              <div>
                <div className="flex flex-col gap-1 text-xs font-semibold uppercase text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Article list ({sortedHistoryItems.length.toLocaleString("ko-KR")}/{historyItems.length.toLocaleString("ko-KR")} shown)
                  </span>
                  <span>
                    full-text saved {visibleSourceSavedHistoryCount.toLocaleString("ko-KR")} · missing{" "}
                    {visibleMissingSourceHistoryCount.toLocaleString("ko-KR")} ·{" "}
                    {historyItems.filter((item) => item.verificationComplete).length.toLocaleString("ko-KR")} verified
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3">
                  <span className="text-xs font-semibold text-zinc-600">정렬 기준</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {historySortOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateHistorySort(option.value)}
                        className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition ${
                          historySortKey === option.value
                            ? "bg-emerald-700 text-white"
                            : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-800"
                        }`}
                      >
                        {option.label}
                        {historySortKey === option.value ? ` · ${historySortDirection === "asc" ? "오름차순" : "내림차순"}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
                    <input
                      type="checkbox"
                      checked={allVisibleHistorySelectedForDelete}
                      disabled={visibleHistoryIds.length === 0 || isBatchDeletingHistory || isAnalyzing}
                      onChange={(event) => toggleVisibleHistoryDeleteSelection(event.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    Select shown ({selectedVisibleHistoryDeleteCount.toLocaleString("ko-KR")}/{visibleHistoryIds.length.toLocaleString("ko-KR")})
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={clearHistoryDeleteSelection}
                      disabled={selectedHistoryIdsForDelete.length === 0 || isBatchDeletingHistory || isAnalyzing}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      Clear selection
                    </button>
                    <button
                      type="button"
                      onClick={() => void reanalyzeSelectedSavedSources()}
                      disabled={selectedHistoryAiReviewDisabled}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                    >
                      {isReanalyzingSavedSource || isAnalyzing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Run AI ({selectedArticleAiReviewProgressLabel})
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedHistoryRecords()}
                      disabled={selectedHistoryIdsForDelete.length === 0 || isBatchDeletingHistory || isAnalyzing || isSavingVerification}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      {isBatchDeletingHistory ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Delete ({selectedHistoryIdsForDelete.length.toLocaleString("ko-KR")})
                    </button>
                  </div>
                </div>
                <div className="mt-2 max-h-[34rem] overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50">
                  <div className="divide-y divide-zinc-200">
                    {sortedHistoryItems.map((item, index) => {
                      const selected = item.id === currentHistoryId;
                      const originalIndex = historyOriginalIndexById.get(item.id) ?? index;
                      const articleNumber = historyArticleNumber(item, originalIndex);
                      const articleTitle = historyArticleTitle(item);
                      const firstAuthor = historyFirstAuthorLabel(item);
                      return (
                        <div
                          key={item.id}
                          className={`grid w-full min-w-0 gap-2 px-2 py-2 text-left transition hover:bg-emerald-50 sm:px-3 ${
                            selected ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedHistoryDeleteSet.has(item.id)}
                              disabled={isBatchDeletingHistory || isAnalyzing}
                              aria-label={`Select article ${articleNumber} for AI review or batch action`}
                              onChange={(event) => toggleHistoryDeleteSelection(item.id, event.target.checked)}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                            />
                            <button
                              type="button"
                              onClick={() => void loadSavedAnalysis(item.id)}
                              aria-pressed={selected}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="min-w-0 break-words text-sm font-semibold leading-5 text-zinc-950">
                                    <span className="mr-2 inline-flex min-w-8 justify-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                                      {articleNumber}
                                    </span>
                                    {articleTitle}
                                  </p>
                                  <p className="mt-1 text-xs font-medium text-zinc-500">1저자: {firstAuthor}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
                                  <span
                                    className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:text-xs ${
                                      item.sourceFileSaved
                                        ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                                        : "bg-rose-50 text-rose-800 ring-1 ring-rose-100"
                                    }`}
                                  >
                                    {item.sourceFileSaved ? "FT saved" : "FT missing"}
                                  </span>
                                  <span
                                    className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:text-xs ${
                                      item.verificationComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                                    }`}
                                  >
                                    {item.verificationComplete ? "done" : "pending"}
                                  </span>
                                  <span
                                    className={`rounded-md px-2 py-1 text-[11px] font-semibold sm:text-xs ${
                                      item.aiModelReviewCount >= aiComparisonProgress.target
                                        ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                                        : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                                    }`}
                                  >
                                    AI {item.aiModelReviewCount}/{aiComparisonProgress.target}
                                  </span>
                                  <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600 sm:text-xs">
                                    {selected ? "details open" : "open"}
                                  </span>
                                </div>
                              </div>
                              {selected ? (
                                <div className="mt-3 grid min-w-0 gap-1.5 rounded-md border border-emerald-100 bg-white p-2 text-xs font-semibold text-zinc-600 sm:grid-cols-2 xl:grid-cols-4">
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">{item.sourceSheet ?? "no sheet"}</span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">{decisionLabel(item.decision)}</span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">confidence {item.confidence}</span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">
                                    {item.verificationMode === "ai_only" ? "AI-only verification" : "2-reviewer verification"}
                                  </span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">
                                    {item.sourceFileSaved ? `source saved: ${item.sourceStorage}` : "legacy/no source"}
                                  </span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">
                                    saved {new Date(item.savedAt).toLocaleString("ko-KR")}
                                  </span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1 sm:col-span-2">
                                    source file: {item.fileName}
                                  </span>
                                  <span className="break-words rounded-md bg-zinc-50 px-2 py-1">1저자: {firstAuthor}</span>
                                </div>
                              ) : null}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {sortedHistoryItems.length === 0 ? (
                      <p className="bg-white p-3 text-sm font-semibold text-zinc-500">
                        No saved articles match this filter.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              {currentHistoryItem ? (
                <div className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50 p-2 sm:p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="break-words text-sm font-semibold leading-5 text-zinc-950">
                      Article{" "}
                      {historyArticleNumber(
                        currentHistoryItem,
                        historyOriginalIndexById.get(currentHistoryItem.id) ?? (currentHistoryIndex >= 0 ? currentHistoryIndex : 0),
                      )}{" "}
                      ·{" "}
                      {historyArticleTitle(currentHistoryItem)}
                    </p>
                    <p className="text-xs font-semibold text-zinc-500">{new Date(currentHistoryItem.savedAt).toLocaleString("ko-KR")}</p>
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-zinc-600">
                    1저자: {historyFirstAuthorLabel(currentHistoryItem)}
                  </p>
                  <p className="mt-1 break-words text-xs font-medium leading-5 text-zinc-600">
                    Source file: {currentHistoryItem.fileName}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-zinc-700">
                    {currentHistoryItem.verificationComplete ? "verification complete" : "verification pending"} ·{" "}
                    {currentHistoryItem.verificationMode === "ai_only" ? "AI-only verification" : "2-reviewer verification"} · reviewer 1:{" "}
                    {currentHistoryItem.reviewerOneName || "not set"} · reviewer 2: {currentHistoryItem.reviewerTwoName || "not set"}
                  </p>
                  <p className="text-xs font-semibold leading-5 text-zinc-600">
                    PI final: {currentHistoryItem.piFinalDecision || "pending"} · {currentHistoryItem.piName || "PI not set"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-emerald-100">
                      {currentHistoryItem.sourceFileSaved
                        ? `source saved: ${currentHistoryItem.sourceStorage}`
                        : "legacy record: source file not saved"}
                    </span>
                    {!currentHistoryItem.sourceFileSaved ? (
                      <button
                        type="button"
                        onClick={() => void saveSourceToSelectedHistory({ rerunAfterSave: true })}
                        disabled={!canUpgradeLegacyRecordWithAi}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 sm:px-3"
                        title="Save source and run AI reviewers"
                      >
                        {isSavingSourceToHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                        Save source + AI
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void runSavedSourceAction()}
                      disabled={savedSourceActionDisabled}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      {isReanalyzingSavedSource || isSavingSourceToHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                      {savedSourceActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedHistoryRecord(currentHistoryItem.id)}
                      disabled={deletingHistoryId === currentHistoryItem.id || isBatchDeletingHistory || isAnalyzing || isSavingVerification}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      {deletingHistoryId === currentHistoryItem.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Delete
                    </button>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-emerald-950">{savedSourceActionHelp}</p>
                  <p className="text-xs font-medium leading-5 text-zinc-600">
                    {currentHistoryItem.sourceSheet ?? "no sheet"} · {decisionLabel(currentHistoryItem.decision)} · confidence{" "}
                    {currentHistoryItem.confidence} · {currentHistoryItem.aiUsed ? `AI ${currentHistoryItem.model}` : "fallback"} · review{" "}
                    {currentHistoryItem.reviewScore}/{currentHistoryItem.reviewGrade}
                  </p>
                  <p className="text-xs font-medium leading-5 text-zinc-600">
                    AI model reviews: {currentHistoryItem.aiModelReviewCount}/{aiComparisonProgress.target}
                    {currentHistoryItem.modelReviewModels.length
                      ? ` - ${currentHistoryItem.modelReviewModels.join(", ")}`
                      : " - no model comparison stored yet"}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p
              className={`rounded-md border border-dashed p-3 text-sm font-semibold ${
                historyError ? "border-amber-200 bg-amber-50 text-amber-950" : "border-zinc-200 bg-zinc-50 text-zinc-500"
              }`}
            >
              {historyError
                ? "Saved full-text analyses are not visible because shared storage could not be loaded. They have not been deleted; reconnect storage and refresh."
                : "No saved full-text analyses yet."}
            </p>
          )}
        </div>
      </section>


      {batchResults.length > 0 ? (
        <section className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-950">Batch analysis queue</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-zinc-600">
                Finished {batchFinishedCount}/{batchResults.length} files - saved {batchSavedCount}, analyzed not saved{" "}
                {batchAnalyzedNotSavedCount}, failed {batchFailedCount}
              </p>
            </div>
            {isAnalyzing ? (
              <span className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Sequential processing
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2">
            {batchResults.map((item, index) => (
              <div key={item.id} className={`rounded-md border p-3 ${batchStatusTone(item.status)}`}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold leading-5">
                      {index + 1}. {item.fileName}
                    </p>
                    <p className="mt-1 text-xs font-semibold opacity-80">
                      {item.savedSourceRerun ? "stored full-text source" : formatFileSize(item.fileSize)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/80 px-2 py-1 text-xs font-semibold ring-1 ring-black/5">
                    {batchStatusLabel(item.status)}
                    {item.status === "analyzing" ? ` · attempt ${item.attempts}/${batchAnalysisMaxAttempts}` : ""}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-5">
                  {item.decision ? `${decisionLabel(item.decision)} - confidence ${item.confidence ?? "n/a"}` : item.message}
                </p>
                {item.savedSourceRerun ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 opacity-90">
                    Saved-source rerun: this queue item reuses the already stored full-text file and writes AI model review results back to the same article record.
                  </p>
                ) : item.match ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 opacity-90">
                    {preventUnmatchedNewRecords ? "Update target" : "Possible existing match"}: {item.match.targetFileName} ·{" "}
                    {item.match.sourceFileSaved ? "source already saved" : "legacy/no source"} · AI reviews{" "}
                    {item.match.aiModelReviewCount}/{aiComparisonProgress.target} · score{" "}
                    {Math.round(item.match.score * 100)}% · {item.match.reason}
                    {preventUnmatchedNewRecords ? "" : " · default action: save as new article unless checksum is identical"}
                  </p>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 opacity-90">
                    No confident local match. The server will try checksum/file/title matching after text extraction
                    {preventUnmatchedNewRecords
                      ? "; if it still cannot match, this file will not be saved as a duplicate record."
                      : "; if it still cannot match, it can be saved as a new record."}
                  </p>
                )}
                {item.decision && item.message ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 opacity-90">{item.message}</p>
                ) : null}
                {item.savedRecordId ? (
                  <button
                    type="button"
                    onClick={() => void loadSavedAnalysis(item.savedRecordId as string)}
                    className="mt-2 inline-flex h-8 items-center rounded-md bg-white/85 px-3 text-xs font-semibold text-zinc-900 ring-1 ring-black/10 transition hover:bg-white"
                  >
                    Open saved result
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-950" role="alert">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-pre-wrap break-words">{error}</span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-white p-3 text-sm font-semibold text-emerald-900" role="status">
          {notice}
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-5 grid gap-4">
          <section className={`rounded-md border p-4 ${decisionTone(analysis.eligibility.decision)}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {analysis.fileName} · {analysis.aiUsed ? `AI ${analysis.model}` : "fallback rules"}
                </p>
                <h4 className="mt-1 text-xl font-semibold">{decisionLabel(analysis.eligibility.decision)}</h4>
                <p className="mt-2 text-sm leading-6">{analysis.eligibility.summary}</p>
              </div>
              <div className="rounded-md bg-white/70 px-4 py-3 text-center ring-1 ring-black/5">
                <p className="text-xs font-semibold">confidence</p>
                <p className="text-3xl font-semibold">{analysis.eligibility.confidence}</p>
              </div>
            </div>
          </section>

          {!analysis.aiUsed && analysis.aiWarning ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950" role="alert">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{analysis.aiWarning}</span>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            <InfoBox label="추출 텍스트" value={`${analysis.extractedTextLength.toLocaleString()} chars`} />
            <InfoBox label="추출 row" value={`${analysis.extraction.rows.length.toLocaleString()} rows`} />
            <InfoBox label="누락 critical fields" value={`${analysis.extraction.missingCriticalFields.length.toLocaleString()}`} />
          </div>

          <details className="rounded-md border border-zinc-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
              AI judgment guide used for this result
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
              {analysis.researcherGuidance || "No run-specific AI judgment guide is stored for this legacy result."}
            </pre>
          </details>

          <details className="rounded-md border border-zinc-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
              Confidence / Score / Grade selection criteria
            </summary>
            <div className="mt-3 grid gap-2">
              {aiScreeningScoreGuide.map(([label, description]) => (
                <div key={label} className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-700">{description}</p>
                </div>
              ))}
            </div>
          </details>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-950">AI review evaluation</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Hyunlab 주간보고 평가 방식처럼 full-text 판정과 추출 결과 자체를 기준별로 다시 점검합니다.
                </p>
              </div>
              <div className="grid min-w-48 grid-cols-2 gap-2 text-center">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase text-zinc-500">score</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-950">{analysis.reviewEvaluation.score}</p>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase text-zinc-500">grade</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-zinc-950">{analysis.reviewEvaluation.grade}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <InfoBox label="Quality summary" value={analysis.reviewEvaluation.summary || "needs review"} />
              <InfoBox label="Improvement" value={analysis.reviewEvaluation.improvement || "needs review"} />
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {Object.entries(analysis.reviewEvaluation.criteria).map(([key, item]) => (
                <div key={key} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-zinc-500">{criteriaLabel(key)}</p>
                    <span className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      {item.score}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-zinc-700">{item.status}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">{item.comment}</p>
                </div>
              ))}
            </div>
          </section>

          {(analysis.modelReviews?.length ?? 0) > 0 ? (
            <section className="rounded-md border border-zinc-200 bg-white p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">AI model reviewer comparison</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Each enabled AI model is stored as an independent reviewer draft. The primary result above uses the first valid structured response; PI adjudication below remains the final decision.
                  </p>
                </div>
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                  {modelReviewCounts.succeeded.toLocaleString("ko-KR")} succeeded / {modelReviewCounts.failed.toLocaleString("ko-KR")} failed /{" "}
                  {modelReviewCounts.total.toLocaleString("ko-KR")} total
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200">
                <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="border-b border-zinc-200 px-3 py-2">Reviewer</th>
                      <th className="border-b border-zinc-200 px-3 py-2">Model</th>
                      <th className="border-b border-zinc-200 px-3 py-2">Decision</th>
                      <th className="border-b border-zinc-200 px-3 py-2">Confidence</th>
                      <th className="border-b border-zinc-200 px-3 py-2">Quality</th>
                      <th className="border-b border-zinc-200 px-3 py-2">Extraction</th>
                      <th className="border-b border-zinc-200 px-3 py-2">Summary / warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analysis.modelReviews ?? []).map((review) => (
                      <tr key={`${review.reviewerId}-${review.modelName}`} className="align-top">
                        <td className="border-b border-zinc-100 px-3 py-2 font-semibold text-zinc-950">
                          {review.label}
                          <span className="mt-1 block text-[11px] font-medium text-zinc-500">
                            {review.aiUsed ? "structured" : "fallback/failed"}
                          </span>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                          <span className="font-semibold">{review.modelName}</span>
                          <span className="mt-1 block text-[11px] text-zinc-500">{review.providerType}</span>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2">
                          <span className={`rounded-md px-2 py-1 font-semibold ${decisionTone(review.decision)}`}>
                            {decisionLabel(review.decision)}
                          </span>
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 font-semibold text-zinc-800">{review.confidence}</td>
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                          {review.reviewScore}/{review.reviewGrade}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                          rows {review.extractionRowCount}; missing {review.missingCriticalFieldCount}; issues {review.validationIssueCount}
                        </td>
                        <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                          <p className="line-clamp-3 leading-5">{review.warning || review.summary || "No model summary returned."}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(analysis.modelReviews ?? []).some((review) => review.warning) ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
                  One or more AI reviewer models failed or returned an invalid structured response. The failed reviewer is preserved in history and should be rerun or adjudicated manually.
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <ResultPanel title="Eligibility reasons" items={analysis.eligibility.reasons} />
            <ResultPanel
              title="Exclusion reasons"
              items={analysis.eligibility.exclusionReasons.length ? analysis.eligibility.exclusionReasons : ["해당 없음 또는 확인 필요"]}
              tone="warning"
            />
          </div>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Reviewer verification checks</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">AI가 제안한 값이며, 최종 판단은 reviewer가 원문 근거로 확인합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard(extractionCsv, "Extraction CSV")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                <span>Copy extraction CSV (not saved)</span>
              </button>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {Object.entries(analysis.eligibility.reviewerChecks).map(([key, value]) => (
                <div key={key} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">{key}</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-950">{boolLabel(value)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Human verification worksheet</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">AI 초안과 독립적으로 reviewer 1/2 판정, 고정 제외사유, conflict 상태를 기록합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => void saveVerification()}
                disabled={isSavingVerification || !currentHistoryId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {isSavingVerification ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Save verification
              </button>
              {aiOnlyVerificationMode ? (
                <button
                  type="button"
                  onClick={() => void restoreDualReviewerWorkflow()}
                  disabled={isSavingVerification || !currentHistoryId}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                >
                  Restore reviewer 1/2 workflow
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void skipReviewerWorkflowForAiOnly()}
                  disabled={isSavingVerification || !currentHistoryId || !analysis}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
                >
                  Skip reviewer 1/2: AI-only
                </button>
              )}
              <button
                type="button"
                onClick={() => void copyToClipboard(verificationCsv, "Verification CSV")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                <span>Copy verification CSV (not saved)</span>
              </button>
            </div>
            <div
              className={`mt-3 rounded-md border p-3 text-xs font-semibold leading-5 ${
                aiOnlyVerificationMode
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700"
              }`}
            >
              {aiOnlyVerificationMode ? (
                <span>
                  AI-only workflow is active for this record. Reviewer 1/2 independent decisions are skipped; PI final adjudication below remains required before this record is treated as complete.
                  {reviewerReviewSkippedAt ? ` Skipped at ${new Date(reviewerReviewSkippedAt).toLocaleString("ko-KR")}.` : ""}
                </span>
              ) : (
                <span>
                  Default workflow remains two independent human reviewers plus PI final adjudication. Use the AI-only skip button only when the researcher explicitly chooses model-only screening.
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                reviewer 1 {reviewerOneName ? `(${reviewerOneName})` : ""}
                <select
                  value={reviewerOneDecision}
                  onChange={(event) => setReviewerOneDecision(event.target.value as ReviewerDecision)}
                  disabled={aiOnlyVerificationMode}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-zinc-900"
                >
                  {reviewerDecisionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                reviewer 2 {reviewerTwoName ? `(${reviewerTwoName})` : ""}
                <select
                  value={reviewerTwoDecision}
                  onChange={(event) => setReviewerTwoDecision(event.target.value as ReviewerDecision)}
                  disabled={aiOnlyVerificationMode}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-zinc-900"
                >
                  {reviewerDecisionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                fixed reason
                <select
                  value={fixedExclusionReason}
                  onChange={(event) => setFixedExclusionReason(event.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-zinc-900"
                >
                  {fixedExclusionReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                conflict status
                <select
                  value={conflictStatus}
                  onChange={(event) => setConflictStatus(event.target.value)}
                  disabled={aiOnlyVerificationMode}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-zinc-900"
                >
                  <option value="needs human verification">needs human verification</option>
                  <option value="agreement">agreement</option>
                  <option value="conflict">conflict</option>
                  <option value="resolved">resolved</option>
                </select>
              </label>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-semibold uppercase text-zinc-500">
              reviewer notes
              <textarea
                value={reviewerNotes}
                onChange={(event) => setReviewerNotes(event.target.value)}
                rows={3}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-900"
                placeholder="page/table 확인 내용, conflict resolution, Excel 수정 사항을 기록하세요."
              />
            </label>
            {aiOnlyVerificationMode ? (
              <label className="mt-3 grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                AI-only skip reason
                <textarea
                  value={reviewerReviewSkipReason}
                  onChange={(event) => setReviewerReviewSkipReason(event.target.value)}
                  rows={2}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-normal normal-case leading-6 text-amber-950"
                  placeholder="Why reviewer 1/2 verification was omitted for this record."
                />
              </label>
            ) : null}
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-zinc-950">PI final adjudication</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[0.8fr_1fr]">
                <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                  PI name
                  <input
                    value={piName}
                    onChange={(event) => setPiName(event.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-zinc-900"
                    placeholder="Principal investigator"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                  final decision
                  <select
                    value={piFinalDecision}
                    onChange={(event) => setPiFinalDecision(event.target.value as PiFinalDecision)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold normal-case text-zinc-900"
                  >
                    {piFinalDecisionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                PI rationale
                <textarea
                  value={piFinalReason}
                  onChange={(event) => setPiFinalReason(event.target.value)}
                  rows={3}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-900"
                  placeholder="Model disagreement, reviewer conflict resolution, and final include/exclude rationale."
                />
              </label>
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-950">Extracted study signals</p>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              <InfoBox label="Design" value={analysis.study.design ?? "확인 필요"} />
              <InfoBox label="Sample" value={analysis.study.sampleSizeTotal ?? "확인 필요"} />
              <InfoBox label="Asymmetry" value={analysis.study.mappedAsymmetryGroup ?? "확인 필요"} />
              <InfoBox label="Instruments" value={analysis.study.instruments.join(", ") || "확인 필요"} />
              <InfoBox label="Recall window" value={analysis.study.recallWindow ?? "확인 필요"} />
              <InfoBox label="Pain definition" value={analysis.study.painDefinition ?? "확인 필요"} />
            </div>
          </section>

          {analysis.extraction.validationIssues.length > 0 || analysis.extraction.missingCriticalFields.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <ResultPanel title="Missing critical fields" items={analysis.extraction.missingCriticalFields} tone="warning" />
              <ResultPanel title="Validation issues" items={analysis.extraction.validationIssues} tone="error" />
            </div>
          ) : null}

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-950">Cell-level evidence</p>
            <div className="mt-3 grid gap-2">
              {analysis.extraction.fieldEvidence.length > 0 ? (
                analysis.extraction.fieldEvidence.map((item) => (
                  <div key={`${item.rowIndex}-${item.field}-${item.value}-${item.evidence}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-zinc-950">
                        row {item.rowIndex + 1} · {item.field}: {item.value || "값 확인 필요"}
                      </p>
                      <p className="text-xs font-semibold text-zinc-500">{item.sourceHint ?? "page/table 확인 필요"}</p>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">{item.evidence}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-600">
                  정량 cell별 근거가 없습니다. AI가 값을 확정하지 않은 경우이며 원문 table/figure/supplement에서 직접 확인해야 합니다.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-950">Evidence snippets</p>
            <div className="mt-3 grid gap-2">
              {analysis.evidence.length > 0 ? (
                analysis.evidence.map((item) => (
                  <div key={`${item.label}-${item.excerpt}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold text-zinc-950">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">{item.excerpt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-zinc-600">근거 문장 추출 없음. 원문 table/figure/supplement 확인 필요.</p>
              )}
            </div>
          </section>

          <ResultPanel title="Next reviewer actions" items={analysis.nextActions} />
        </div>
      ) : null}
    </section>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-zinc-950">{value}</p>
    </div>
  );
}

function ResultPanel({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "warning" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-950"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-zinc-200 bg-white text-zinc-800";
  const Icon = tone === "error" ? AlertCircle : tone === "warning" ? AlertTriangle : CheckCircle2;

  return (
    <section className={`rounded-md border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <ul className="mt-3 grid gap-1 text-sm leading-6">
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li>없음</li>}
      </ul>
    </section>
  );
}
