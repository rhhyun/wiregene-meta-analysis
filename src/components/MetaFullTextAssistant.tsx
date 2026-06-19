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

type ReviewerDecision = "pending" | "include_quantitative" | "include_narrative_support" | "exclude" | "conflict";
type PiFinalDecision = "pending" | "include_quantitative" | "include_narrative_support" | "exclude";
type HistoryFilter =
  | "all"
  | "legacy_source"
  | "verification_pending"
  | "verification_complete"
  | MetaFullTextAnalysis["eligibility"]["decision"];

type MetaFullTextHistorySummary = {
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

type BatchAnalysisResult = {
  id: string;
  fileName: string;
  fileSize: number;
  status: BatchAnalysisStatus;
  savedRecordId: string | null;
  decision: MetaFullTextAnalysis["eligibility"]["decision"] | null;
  confidence: number | null;
  message: string;
};

const largeFileUploadThresholdBytes = 4 * 1024 * 1024;
const googleDriveResumableChunkUnitBytes = 256 * 1024;
const largeFileUploadChunkBytes = googleDriveResumableChunkUnitBytes * 9;

type ApiPayload = Record<string, unknown>;

type AnalysisPayload = {
  analysis: MetaFullTextAnalysis;
  savedRecord?: MetaFullTextHistorySummary | null;
  saveError?: unknown;
  duplicateAction?: {
    status: "merged" | "saved_new" | "merge_target_not_found_saved_new";
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

function shortenErrorText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 600 ? `${normalized.slice(0, 597)}...` : normalized;
}

async function readHistoryListPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "Saved full-text analyses could not be loaded."));
  }
  return payload as {
    records: MetaFullTextHistorySummary[];
    reviewerSettings: MetaFullTextReviewerSettings;
    stats: MetaFullTextHistoryStats;
    deletedRecord?: MetaFullTextHistorySummary;
    sourceFileDeleted?: boolean;
    sourceFileDeleteWarning?: string | null;
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

function findDuplicateHistoryItemForFile(nextFile: File, historyItems: MetaFullTextHistorySummary[]) {
  const fileKey = normalizedArticleFileKey(nextFile.name);
  if (!fileKey) return null;
  return historyItems.find((item) => normalizedArticleFileKey(item.fileName) === fileKey) ?? null;
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
    "OK: merge the new AI model result into the existing record. The paper will not appear twice, and previous AI decisions/model reviews remain in the comparison history.",
    "Cancel: stop this run so a duplicate saved article is not created.",
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
      chunkResponse = await fetch("/api/meta-analysis/full-text/upload-chunk", {
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
      });
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

function stripGeneratedReferenceContext(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^Excel source sheet: .+; review mode: .+$/.test(line.trim()))
    .join("\n")
    .trim();
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
    slot.modelName.trim().toLowerCase() === "gemini-3.5"
  ) {
    return "gemini-3.5 -> gemini-3.5-flash";
  }
  return slot.modelName;
}

export function MetaFullTextAssistant({ extractionColumns, focus, projectId, worksheetOptions = [] }: MetaFullTextAssistantProps) {
  const analyzingRef = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<BatchAnalysisResult[]>([]);
  const [worksheetName, setWorksheetName] = useState(worksheetOptions[0]?.sheetName ?? "");
  const [referenceRecord, setReferenceRecord] = useState("");
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
  const [selectedAiReviewerIds, setSelectedAiReviewerIds] = useState<string[]>([]);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [aiSettingsError, setAiSettingsError] = useState("");
  const [reviewerNamesSaved, setReviewerNamesSaved] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");

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
  const aiComparisonTargetCount =
    selectedRunnableAiReviewerIds.length || runnableAiReviewerSlots.length || aiReviewerSlots.filter(aiReviewerRunnable).length || 3;
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
      verification_pending: historyItems.filter((item) => !item.verificationComplete).length,
      verification_complete: historyItems.filter((item) => item.verificationComplete).length,
    }),
    [historyItems],
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
        if (historyFilter === "verification_pending") return !item.verificationComplete;
        if (historyFilter === "verification_complete") return item.verificationComplete;
        return item.decision === historyFilter;
      }),
    [historyFilter, historyItems],
  );
  const analyzeButtonLabel = isAnalyzing
    ? "Analyzing"
    : currentHistoryItem && !currentHistoryItem.sourceFileSaved && files.length === 1
      ? "Use saved-record update button above"
    : files.length > 1
      ? `Analyze queue as NEW records (${files.length})`
      : files.length === 1
        ? "Analyze as NEW saved record"
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

  const applyHistoryOverview = useCallback((payload: {
    records: MetaFullTextHistorySummary[];
    reviewerSettings?: MetaFullTextReviewerSettings;
    stats?: MetaFullTextHistoryStats;
  }) => {
    setHistoryItems(payload.records);
    if (payload.stats) setHistoryStats(payload.stats);
    if (payload.reviewerSettings) {
      setReviewerOneName(payload.reviewerSettings.reviewerOneName);
      setReviewerTwoName(payload.reviewerSettings.reviewerTwoName);
      setReviewerNamesSaved(
        Boolean(payload.reviewerSettings.reviewerOneName.trim()) &&
          Boolean(payload.reviewerSettings.reviewerTwoName.trim()),
      );
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const payload = await readHistoryListPayload(
        await fetch(fullTextHistoryListUrl(projectId), { cache: "no-store" }),
      );
      applyHistoryOverview(payload);
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "Saved full-text analyses could not be loaded.");
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
          setHistoryError(caught instanceof Error ? caught.message : "Saved full-text analyses could not be loaded.");
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

  async function reanalyzeSavedSource() {
    if (!currentHistoryId) {
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
      const payload = await readHistoryRecordPayload(
        await fetch(fullTextHistoryRecordUrl(currentHistoryId, projectId, "reanalyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, reviewerIds: selectedRunnableAiReviewerIds }),
        }),
      );
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
          await fetch("/api/meta-analysis/full-text/upload-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: sourceFile.name,
              mimeType: sourceFile.type || "application/octet-stream",
              fileSize: sourceFile.size,
            }),
          }),
        );
        const driveFile = await uploadLargeFileThroughServerChunks(sourceFile, session, (message) => setNotice(message));
        payload = await readHistoryRecordPayload(
          await fetch(fullTextHistoryRecordUrl(currentHistoryId, projectId, "source"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              driveFileId: driveFile.id,
              fileName: driveFile.name || sourceFile.name,
              mimeType: driveFile.mimeType || sourceFile.type || "application/octet-stream",
              fileSize: Number(driveFile.size) || sourceFile.size,
            }),
          }),
        );
      } else {
        const formData = new FormData();
        formData.set("file", sourceFile);
        formData.set("projectId", projectId);
        payload = await readHistoryRecordPayload(
          await fetch(fullTextHistoryRecordUrl(currentHistoryId, projectId, "source"), {
            method: "POST",
            body: formData,
          }),
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
    setFiles(nextFiles);
    setBatchResults(
      nextFiles.map((nextFile, index) => ({
        id: batchFileId(nextFile, index),
        fileName: nextFile.name,
        fileSize: nextFile.size,
        status: "pending",
        savedRecordId: null,
        decision: null,
        confidence: null,
        message: "Waiting for sequential analysis.",
      })),
    );
    if (!currentHistoryId) {
      setAnalysis(null);
      resetVerificationState();
    }
    setError("");
    setNotice("");
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

  function createAnalysisFormData(nextFile: File, duplicateTarget: MetaFullTextHistorySummary | null) {
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
    formData.set("duplicatePolicy", duplicateTarget ? "merge" : "new");
    if (duplicateTarget) formData.set("duplicateTargetId", duplicateTarget.id);
    return formData;
  }

  function createAnalysisJsonPayload(
    nextFile: File,
    driveFile: GoogleDriveUploadPayload,
    duplicateTarget: MetaFullTextHistorySummary | null,
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
      duplicatePolicy: duplicateTarget ? "merge" : "new",
      duplicateTargetId: duplicateTarget?.id ?? null,
    };
  }

  function shouldUseLargeFileUpload(nextFile: File) {
    return nextFile.size > largeFileUploadThresholdBytes;
  }

  async function analyzeSingleFullTextFile(
    nextFile: File,
    onStage: (message: string) => void,
    duplicateTarget: MetaFullTextHistorySummary | null,
  ) {
    if (!shouldUseLargeFileUpload(nextFile)) {
      onStage(
        duplicateTarget
          ? `Extracting full text and merging AI review into existing record: ${duplicateTarget.fileName}.`
          : "Extracting full text and requesting AI review.",
      );
      return readAnalysisPayload(
        await fetch("/api/meta-analysis/full-text/analyze", {
          method: "POST",
          body: createAnalysisFormData(nextFile, duplicateTarget),
        }),
      );
    }

    onStage("Creating a Google Drive resumable upload session for this large file.");
    const session = await readUploadSessionPayload(
      await fetch("/api/meta-analysis/full-text/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: nextFile.name,
          mimeType: nextFile.type || "application/octet-stream",
          fileSize: nextFile.size,
        }),
      }),
    );

    const driveFile = await uploadLargeFileThroughServerChunks(nextFile, session, onStage);

    onStage("Analyzing the uploaded full text from Google Drive.");
    return readAnalysisPayload(
      await fetch("/api/meta-analysis/full-text/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createAnalysisJsonPayload(nextFile, driveFile, duplicateTarget)),
      }),
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
    if (duplicateMatches.length > 0) {
      const confirmed = window.confirm(duplicateMergePrompt(duplicateMatches));
      if (!confirmed) {
        setNotice("Duplicate full-text upload canceled. No duplicate saved article record was created.");
        return;
      }
      for (const match of duplicateMatches) duplicateTargetByResultId.set(match.resultId, match.target);
    }

    if (currentHistoryItem && duplicateMatches.length === 0) {
      const confirmed = window.confirm(
        "A saved record is selected, but this upload button creates NEW saved article record(s). To update the selected record without duplication, cancel this and use the saved-record update button.",
      );
      if (!confirmed) return;
    } else if (!currentHistoryItem && duplicateMatches.length === 0 && historyDecisionCounts.legacy_source > 0) {
      const confirmed = window.confirm(
        "No saved record is selected. This upload path creates NEW saved article record(s) and can increase the saved count (for example, 72 -> 73). To update an old GPT-5-nano legacy record without duplication, cancel this, select the matching legacy/no source record, choose the PDF, then use the saved-record update button.",
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
        savedRecordId: null,
        decision: null,
        confidence: null,
        message: "Waiting for sequential analysis.",
      })),
    );
    try {
      let savedCount = 0;
      let analyzedNotSavedCount = 0;
      let failedCount = 0;

      for (const [index, nextFile] of queuedFiles.entries()) {
        const resultId = batchFileId(nextFile, index);
        setNotice(`Analyzing ${index + 1}/${queuedFiles.length}: ${nextFile.name}`);
        setBatchResults((current) =>
          current.map((item) =>
            item.id === resultId
              ? {
                  ...item,
                  status: "analyzing",
                  message: shouldUseLargeFileUpload(nextFile)
                    ? "Preparing server chunk upload for this large file."
                    : "Extracting full text and requesting AI review.",
                }
              : item,
          ),
        );

        try {
          const duplicateTarget = duplicateTargetByResultId.get(resultId) ?? null;
          const payload = await analyzeSingleFullTextFile(
            nextFile,
            (message) =>
              setBatchResults((current) =>
                current.map((item) => (item.id === resultId ? { ...item, message } : item)),
              ),
            duplicateTarget,
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
                        ? "Merged into existing full-text history record; no duplicate article was created."
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
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">{title}</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">원문 업로드 → AI 초안 → 연구자 검증</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">{detail}</p>
        </div>
      </div>

      <section className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
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
      </section>

      <section className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
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
            새 AI model로 다시 분석하려면 기존 저장 논문을 하나 선택한 뒤, 해당 full-text article을 한 번 업로드해서 그 기록에 연결해야 합니다.
          </span>
          Existing GPT-5-nano legacy rerun: select a `legacy/no source` saved record, choose the matching full-text file once, then the saved-record update button saves the source and immediately runs the selected AI reviewers.
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
      </section>

      <section className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-700" aria-hidden />
            <p className="text-sm font-semibold text-zinc-950">Saved full-text analyses</p>
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
        {historyDecisionCounts.legacy_source > 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">
            현재 저장된 분석 결과 중 {historyDecisionCounts.legacy_source.toLocaleString("ko-KR")}개는 `legacy/no source`입니다. 이 기록들은 GPT-5-nano 분석 결과만 저장되어 있고 원문 PDF/Word full-text 파일은 저장되어 있지 않습니다. 새 AI model을 적용하려면 각 논문 기록을 선택하고 matching full-text article을 한 번 업로드해 source를 연결해야 합니다.
          </div>
        ) : null}
        {historySheetProgress.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
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
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
              className={`rounded-md border p-3 text-left transition ${
                historyFilter === filter
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50"
              }`}
            >
              <span className="block text-xs font-semibold uppercase text-zinc-500">{label}</span>
              <span className="mt-1 block text-2xl font-semibold text-zinc-950">{count.toLocaleString("ko-KR")}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ["all", `All saved ${historyDecisionCounts.all}`],
            ["legacy_source", `Legacy/no source ${historyDecisionCounts.legacy_source}`],
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
                <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase text-zinc-500">
                  <span>
                    Saved article list ({filteredHistoryItems.length.toLocaleString("ko-KR")}/{historyItems.length.toLocaleString("ko-KR")} shown)
                  </span>
                  <span>{historyItems.filter((item) => item.verificationComplete).length.toLocaleString("ko-KR")} verified</span>
                </div>
                <div className="mt-2 max-h-[34rem] overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50">
                  <div className="divide-y divide-zinc-200">
                    {filteredHistoryItems.map((item, index) => {
                      const selected = item.id === currentHistoryId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void loadSavedAnalysis(item.id)}
                          aria-pressed={selected}
                          className={`grid w-full gap-2 px-3 py-3 text-left transition hover:bg-emerald-50 ${
                            selected ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-semibold text-zinc-950">
                              {index + 1}. {item.fileName}
                            </p>
                            <span
                              className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                                item.verificationComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {item.verificationComplete ? "verified" : "pending"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs font-semibold text-zinc-600">
                            <span className="rounded-md bg-zinc-100 px-2 py-1">{item.sourceSheet ?? "no sheet"}</span>
                            <span className="rounded-md bg-zinc-100 px-2 py-1">{decisionLabel(item.decision)}</span>
                            <span className="rounded-md bg-zinc-100 px-2 py-1">confidence {item.confidence}</span>
                            <span className="rounded-md bg-zinc-100 px-2 py-1">
                              {item.verificationMode === "ai_only" ? "AI-only verification" : "2-reviewer verification"}
                            </span>
                            <span className="rounded-md bg-zinc-100 px-2 py-1">
                              {item.sourceFileSaved ? `source saved: ${item.sourceStorage}` : "legacy/no source"}
                            </span>
                            <span
                              className={`rounded-md px-2 py-1 ${
                                item.aiModelReviewCount >= aiComparisonProgress.target
                                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                              }`}
                            >
                              AI reviews {item.aiModelReviewCount}/{aiComparisonProgress.target}
                            </span>
                            <span className="rounded-md bg-zinc-100 px-2 py-1">{new Date(item.savedAt).toLocaleString("ko-KR")}</span>
                          </div>
                          {item.titleGuess ? <p className="line-clamp-2 text-xs leading-5 text-zinc-500">{item.titleGuess}</p> : null}
                        </button>
                      );
                    })}
                    {filteredHistoryItems.length === 0 ? (
                      <p className="bg-white p-3 text-sm font-semibold text-zinc-500">
                        No saved articles match this filter.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              {currentHistoryItem ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="truncate text-sm font-semibold text-zinc-950">{currentHistoryItem.fileName}</p>
                    <p className="text-xs font-semibold text-zinc-500">{new Date(currentHistoryItem.savedAt).toLocaleString("ko-KR")}</p>
                  </div>
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
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      {isReanalyzingSavedSource || isSavingSourceToHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                      {savedSourceActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedHistoryRecord(currentHistoryItem.id)}
                      disabled={deletingHistoryId === currentHistoryItem.id || isAnalyzing || isSavingVerification}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      {deletingHistoryId === currentHistoryItem.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Delete saved record
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
            <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-500">
              No saved full-text analyses yet.
            </p>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
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
              onChange={(event) => handleFilesChange(Array.from(event.target.files ?? []))}
              disabled={isAnalyzing}
              className="mt-3 w-full text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
            />
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
              Select multiple PDF, Word, TXT, or MD files once. The app analyzes them one by one and saves each result as a separate history record.
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
              AI reviewer run: {selectedAiReviewerLabel}
            </p>
            {!currentHistoryItem && files.length > 0 ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
                No saved record is selected. This upload path creates a NEW saved article record and can increase the saved count, for example 72 -&gt; 73. To update an old GPT-5-nano legacy record without duplication, select that `legacy/no source` record above first, choose the matching file, then use the saved-record update button.
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
                    <p className="truncate text-sm font-semibold">
                      {index + 1}. {item.fileName}
                    </p>
                    <p className="mt-1 text-xs font-semibold opacity-80">{formatFileSize(item.fileSize)}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/80 px-2 py-1 text-xs font-semibold ring-1 ring-black/5">
                    {batchStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-5">
                  {item.decision ? `${decisionLabel(item.decision)} - confidence ${item.confidence ?? "n/a"}` : item.message}
                </p>
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
