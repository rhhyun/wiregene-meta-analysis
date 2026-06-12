"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  Loader2,
  SearchCheck,
  UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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

async function readAnalysisPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "full-text 분석에 실패했습니다."));
  }
  return payload as { analysis: MetaFullTextAnalysis };
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
  const [file, setFile] = useState<File | null>(null);
  const [worksheetName, setWorksheetName] = useState(worksheetOptions[0]?.sheetName ?? "");
  const [referenceRecord, setReferenceRecord] = useState("");
  const [analysis, setAnalysis] = useState<MetaFullTextAnalysis | null>(null);
  const [reviewerOneDecision, setReviewerOneDecision] = useState<ReviewerDecision>("pending");
  const [reviewerTwoDecision, setReviewerTwoDecision] = useState<ReviewerDecision>("pending");
  const [fixedExclusionReason, setFixedExclusionReason] = useState(fixedExclusionReasons[0]);
  const [conflictStatus, setConflictStatus] = useState("needs human verification");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
          reviewer_1_decision: reviewerOneDecision,
          reviewer_2_decision: reviewerTwoDecision,
          fixed_exclusion_reason: fixedExclusionReason,
          conflict_status: conflictStatus,
          reviewer_notes: reviewerNotes,
          analyzed_at: analysis.analyzedAt,
        },
      ],
    );
  }, [analysis, conflictStatus, fixedExclusionReason, reviewerNotes, reviewerOneDecision, reviewerTwoDecision, selectedWorksheet]);

  function resetVerificationState() {
    setReviewerOneDecision("pending");
    setReviewerTwoDecision("pending");
    setFixedExclusionReason(fixedExclusionReasons[0]);
    setConflictStatus("needs human verification");
    setReviewerNotes("");
  }

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setAnalysis(null);
    setError("");
    setNotice("");
    resetVerificationState();
  }

  async function copyToClipboard(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setError("");
      setNotice(`${label} 복사했습니다.`);
    } catch {
      setNotice("");
      setError("클립보드 복사에 실패했습니다. 브라우저 권한을 확인하거나 CSV를 다시 생성해 주세요.");
    }
  }

  async function analyzeFullText() {
    if (analyzingRef.current || !file) return;
    analyzingRef.current = true;
    setError("");
    setNotice("");
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
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

      const payload = await readAnalysisPayload(
        await fetch("/api/meta-analysis/full-text/analyze", {
          method: "POST",
          body: formData,
        }),
      );
      setAnalysis(payload.analysis);
      setNotice("full-text article 분석 초안을 생성했습니다. 연구자가 반드시 원문 근거와 숫자를 검증해야 합니다.");
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
          disabled={isAnalyzing || !file}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="h-4 w-4" aria-hidden />}
          {isAnalyzing ? "분석 중" : "full-text 분석"}
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <label className="grid gap-2 text-sm font-semibold text-zinc-700">
          full-text 파일
          <div className="rounded-md border border-dashed border-emerald-300 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <UploadCloud className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-950">{file ? file.name : "PDF, Word, TXT"}</p>
                <p className="mt-1 text-xs font-medium text-zinc-500">
                  {file ? `${Math.round(file.size / 1024).toLocaleString("ko-KR")} KB` : "full-text 원문 파일"}
                </p>
              </div>
            </div>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="mt-3 w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
            />
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

          <div className="grid gap-3 lg:grid-cols-3">
            <InfoBox label="추출 텍스트" value={`${analysis.extractedTextLength.toLocaleString()} chars`} />
            <InfoBox label="추출 row" value={`${analysis.extraction.rows.length.toLocaleString()} rows`} />
            <InfoBox label="누락 critical fields" value={`${analysis.extraction.missingCriticalFields.length.toLocaleString()}`} />
          </div>

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
                onClick={() => void copyToClipboard(extractionCsv, "extraction CSV를")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                extraction CSV 복사
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
                onClick={() => void copyToClipboard(verificationCsv, "verification CSV를")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                verification CSV 복사
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                reviewer 1
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
                reviewer 2
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
