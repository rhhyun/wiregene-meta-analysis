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
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";
import type { MetaFullTextAnalysis } from "@/lib/meta-full-text-analysis";

type MetaFullTextAssistantProps = {
  extractionColumns: string[];
  focus: "screening" | "extraction";
  worksheetOptions?: {
    sheetName: string;
    label: string;
    reviewMode: "standard" | "cautious" | "not_required";
  }[];
};

type ReviewerDecision = "pending" | "include_quantitative" | "include_narrative_support" | "exclude" | "conflict";

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
  reviewScore: number;
  reviewGrade: string;
  extractionRowCount: number;
  missingCriticalFieldCount: number;
  validationIssueCount: number;
  verificationComplete: boolean;
  reviewerOneName: string;
  reviewerTwoName: string;
};

type MetaFullTextVerification = {
  reviewerOneName: string;
  reviewerTwoName: string;
  reviewerOneDecision: string;
  reviewerTwoDecision: string;
  fixedExclusionReason: string;
  conflictStatus: string;
  reviewerNotes: string;
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

type MetaFullTextHistoryRecord = {
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

type BatchAnalysisStatus = "pending" | "analyzing" | "saved" | "failed";

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

async function readAnalysisPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "full-text 분석에 실패했습니다."));
  }
  return payload as {
    analysis: MetaFullTextAnalysis;
    savedRecord?: MetaFullTextHistorySummary | null;
    saveError?: unknown;
  };
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

function criteriaLabel(value: string) {
  return value.replaceAll("_", " ");
}

function batchFileId(file: File, index: number) {
  return `${index}-${file.name}-${file.size}-${file.lastModified}`;
}

function batchStatusLabel(status: BatchAnalysisStatus) {
  if (status === "analyzing") return "analyzing";
  if (status === "saved") return "saved";
  if (status === "failed") return "failed";
  return "pending";
}

function batchStatusTone(status: BatchAnalysisStatus) {
  if (status === "analyzing") return "border-sky-200 bg-sky-50 text-sky-900";
  if (status === "saved") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

const reviewerDecisionOptions: { value: ReviewerDecision; label: string }[] = [
  { value: "pending", label: "검증 전" },
  { value: "include_quantitative", label: "정량 포함" },
  { value: "include_narrative_support", label: "서술/근거 포함" },
  { value: "exclude", label: "제외" },
  { value: "conflict", label: "불일치/논의" },
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

export function MetaFullTextAssistant({ extractionColumns, focus, worksheetOptions = [] }: MetaFullTextAssistantProps) {
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingVerification, setIsSavingVerification] = useState(false);
  const [isSavingReviewerSettings, setIsSavingReviewerSettings] = useState(false);
  const [reviewerNamesSaved, setReviewerNamesSaved] = useState(false);

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
  const batchSavedCount = batchResults.filter((item) => item.status === "saved").length;
  const batchFailedCount = batchResults.filter((item) => item.status === "failed").length;
  const batchFinishedCount = batchSavedCount + batchFailedCount;

  const extractionCsv = useMemo(() => {
    if (!analysis) return "";
    return csvRows(analysis.extraction.columns, analysis.extraction.rows);
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
        "ai_config_source",
        "ai_warning",
        "reviewer_1_name",
        "reviewer_2_name",
        "reviewer_1_decision",
        "reviewer_2_decision",
        "fixed_exclusion_reason",
        "conflict_status",
        "reviewer_notes",
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
          ai_config_source: analysis.aiConfigSource ?? "",
          ai_warning: analysis.aiWarning ?? "",
          reviewer_1_name: reviewerOneName,
          reviewer_2_name: reviewerTwoName,
          reviewer_1_decision: reviewerOneDecision,
          reviewer_2_decision: reviewerTwoDecision,
          fixed_exclusion_reason: fixedExclusionReason,
          conflict_status: conflictStatus,
          reviewer_notes: reviewerNotes,
          analyzed_at: analysis.analyzedAt,
        },
      ],
    );
  }, [
    analysis,
    conflictStatus,
    fixedExclusionReason,
    reviewerNotes,
    reviewerOneDecision,
    reviewerOneName,
    reviewerTwoDecision,
    reviewerTwoName,
    selectedWorksheet,
  ]);

  function resetVerificationState() {
    setReviewerOneDecision("pending");
    setReviewerTwoDecision("pending");
    setFixedExclusionReason(fixedExclusionReasons[0]);
    setConflictStatus("needs human verification");
    setReviewerNotes("");
  }

  function applyVerification(verification?: Partial<MetaFullTextVerification> | null) {
    if (verification?.reviewerOneName) setReviewerOneName(verification.reviewerOneName);
    if (verification?.reviewerTwoName) setReviewerTwoName(verification.reviewerTwoName);
    setReviewerOneDecision((verification?.reviewerOneDecision as ReviewerDecision) || "pending");
    setReviewerTwoDecision((verification?.reviewerTwoDecision as ReviewerDecision) || "pending");
    setFixedExclusionReason(verification?.fixedExclusionReason || fixedExclusionReasons[0]);
    setConflictStatus(verification?.conflictStatus || "needs human verification");
    setReviewerNotes(verification?.reviewerNotes || "");
  }

  function upsertHistoryItem(item: MetaFullTextHistorySummary) {
    setHistoryItems((current) => [item, ...current.filter((record) => record.id !== item.id)].slice(0, 50));
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
        await fetch("/api/meta-analysis/full-text/history?limit=50", { cache: "no-store" }),
      );
      applyHistoryOverview(payload);
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "Saved full-text analyses could not be loaded.");
    } finally {
      setHistoryLoading(false);
    }
  }, [applyHistoryOverview]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialHistory() {
      try {
        const payload = await readHistoryListPayload(
          await fetch("/api/meta-analysis/full-text/history?limit=50", { cache: "no-store" }),
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
  }, [applyHistoryOverview]);

  async function loadSavedAnalysis(id: string) {
    setError("");
    setNotice("");
    try {
      const payload = await readHistoryRecordPayload(
        await fetch(`/api/meta-analysis/full-text/history/${encodeURIComponent(id)}`, { cache: "no-store" }),
      );
      const record = payload.record;
      setAnalysis(record.analysis);
      setCurrentHistoryId(record.id);
      setReferenceRecord(record.referenceRecord ?? "");
      if (record.sourceSheet) setWorksheetName(record.sourceSheet);
      applyVerification(record.verification);
      setNotice(`Loaded saved analysis: ${record.fileName}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saved full-text analysis could not be loaded.");
    }
  }

  async function saveReviewerSettings() {
    setIsSavingReviewerSettings(true);
    setError("");
    setNotice("");
    try {
      const payload = await readReviewerSettingsPayload(
        await fetch("/api/meta-analysis/full-text/history", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
        await fetch(`/api/meta-analysis/full-text/history/${encodeURIComponent(currentHistoryId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerOneDecision,
            reviewerTwoDecision,
            reviewerOneName,
            reviewerTwoName,
            fixedExclusionReason,
            conflictStatus,
            reviewerNotes,
          }),
        }),
      );
      applyVerification(payload.record.verification);
      const overview = await readHistoryListPayload(
        await fetch("/api/meta-analysis/full-text/history?limit=50", { cache: "no-store" }),
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
    setAnalysis(null);
    setCurrentHistoryId(null);
    setError("");
    setNotice("");
    resetVerificationState();
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

  function createAnalysisFormData(nextFile: File) {
    const formData = new FormData();
    formData.set("file", nextFile);
    formData.set(
      "referenceRecord",
      [
        selectedWorksheet
          ? `Excel source sheet: ${selectedWorksheet.sheetName} (${selectedWorksheet.label}); review mode: ${selectedWorksheet.reviewMode}`
          : "",
        referenceRecord,
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
    return formData;
  }

  async function analyzeFullText() {
    if (analyzingRef.current || files.length === 0) return;
    if (!reviewerSettingsReady) {
      setError("Save reviewer 1 and reviewer 2 names before full-text analysis.");
      return;
    }
    const queuedFiles = files;
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
                  message: "Extracting full text and requesting AI review.",
                }
              : item,
          ),
        );

        try {
          const payload = await readAnalysisPayload(
            await fetch("/api/meta-analysis/full-text/analyze", {
              method: "POST",
              body: createAnalysisFormData(nextFile),
            }),
          );
          setAnalysis(payload.analysis);
          if (payload.savedRecord && !payload.saveError) {
            savedCount += 1;
            setCurrentHistoryId(payload.savedRecord.id);
            upsertHistoryItem(payload.savedRecord);
            setBatchResults((current) =>
              current.map((item) =>
                item.id === resultId
                  ? {
                      ...item,
                      status: "saved",
                      savedRecordId: payload.savedRecord?.id ?? null,
                      decision: payload.analysis.eligibility.decision,
                      confidence: payload.analysis.eligibility.confidence,
                      message: "Saved automatically to full-text history.",
                    }
                  : item,
              ),
            );
          } else {
            failedCount += 1;
            setCurrentHistoryId(null);
            setBatchResults((current) =>
              current.map((item) =>
                item.id === resultId
                  ? {
                      ...item,
                      status: "failed",
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
        `Batch analysis finished. Saved ${savedCount}/${queuedFiles.length} files; failed ${failedCount}. Open saved records to verify each result.`,
      );
      if (failedCount > 0) {
        setError(`Batch analysis completed with ${failedCount} failed file(s). Check the batch queue details below.`);
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
        <button
          type="button"
          onClick={analyzeFullText}
          disabled={isAnalyzing || files.length === 0 || !reviewerSettingsReady}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="h-4 w-4" aria-hidden />}
          {isAnalyzing ? "Analyzing" : files.length > 1 ? `Analyze queue (${files.length})` : "Analyze full text"}
        </button>
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
            Save reviewer names before analysis so each researcher can identify their assigned verification role.
          </p>
        ) : null}
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
        <div className="mt-3 grid gap-2">
          {historyItems.length > 0 ? (
            historyItems.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void loadSavedAnalysis(item.id)}
                className={`grid gap-1 rounded-md border p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 ${
                  currentHistoryId === item.id ? "border-emerald-400 bg-emerald-50" : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="truncate text-sm font-semibold text-zinc-950">{item.fileName}</p>
                  <p className="text-xs font-semibold text-zinc-500">{new Date(item.savedAt).toLocaleString("ko-KR")}</p>
                </div>
                <p className="text-xs font-semibold leading-5 text-zinc-700">
                  {item.verificationComplete ? "verification complete" : "verification pending"} · reviewer 1:{" "}
                  {item.reviewerOneName || "not set"} · reviewer 2: {item.reviewerTwoName || "not set"}
                </p>
                <p className="text-xs font-medium leading-5 text-zinc-600">
                  {item.sourceSheet ?? "no sheet"} · {decisionLabel(item.decision)} · confidence {item.confidence} ·{" "}
                  {item.aiUsed ? `AI ${item.model}` : "fallback"} · review {item.reviewScore}/{item.reviewGrade}
                </p>
              </button>
            ))
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
            <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600">
              Select multiple PDF, Word, TXT, or MD files once. The app analyzes them one by one and saves each result as a separate history record.
            </p>
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
              onChange={(event) => setReferenceRecord(event.target.value)}
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
                Finished {batchFinishedCount}/{batchResults.length} files - saved {batchSavedCount}, failed {batchFailedCount}
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
                <p className="mt-2 text-xs font-semibold leading-5">
                  {item.decision ? `${decisionLabel(item.decision)} - confidence ${item.confidence ?? "n/a"}` : item.message}
                </p>
                {item.decision && item.message ? <p className="mt-1 text-xs leading-5 opacity-90">{item.message}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-950" role="alert">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
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
              <button
                type="button"
                onClick={() => void copyToClipboard(verificationCsv, "Verification CSV")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                <span>Copy verification CSV (not saved)</span>
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                reviewer 1 {reviewerOneName ? `(${reviewerOneName})` : ""}
                <select
                  value={reviewerOneDecision}
                  onChange={(event) => setReviewerOneDecision(event.target.value as ReviewerDecision)}
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
