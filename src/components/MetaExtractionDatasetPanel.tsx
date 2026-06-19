"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";

type ExtractionSection = {
  section: string;
  fields: string[];
};

type DatasetRecord = {
  id: string;
  historyId: string;
  rowIndex: number;
  fileName: string;
  sourceSheet: string | null;
  titleGuess: string | null;
  finalDecision: string;
  verified: boolean;
  verifiedAt: string | null;
  verifiedBy: string;
  verificationNotes: string;
  manualRequiredFields: string[];
  validationIssues: string[];
  missingCriticalFields: string[];
  evidenceCount: number;
  fieldCoverage: Record<string, FieldCoverageStatus>;
  coverageCounts: CoverageCounts;
  row: Record<string, string>;
};

type FieldCoverageStatus = "audit" | "evidence-backed" | "auto-filled" | "manual-required" | "blank";

type CoverageCounts = {
  evidenceBacked: number;
  autoFilled: number;
  manualRequired: number;
  blank: number;
};

type DatasetOverview = {
  columns: string[];
  records: DatasetRecord[];
  csv: string;
  stats: {
    includedRecordCount: number;
    excelRowCount: number;
    verifiedRowCount: number;
    manualRequiredFieldCount: number;
    evidenceBackedFieldCount: number;
    autoFilledFieldCount: number;
    blankFieldCount: number;
    editableFieldCount: number;
  };
  updatedAt: string;
};

type MetaExtractionDatasetPanelProps = {
  extractionSections: ExtractionSection[];
  projectId: string;
};

type ProjectFileSavePayload = {
  savedFile?: {
    fileName: string;
    path: string;
  };
  error?: string;
};

const auditSection: ExtractionSection = {
  section: "Saved audit trail",
  fields: [
    "history_id",
    "file_name",
    "source_sheet",
    "saved_at",
    "analyzed_at",
    "final_decision",
    "verification_mode",
    "reviewer_review_skipped_at",
    "reviewer_1_name",
    "reviewer_2_name",
    "reviewer_conflict_status",
    "ai_decision",
    "ai_confidence",
    "ai_review_score",
    "ai_review_grade",
    "extraction_verified",
    "extraction_verified_at",
    "extraction_verified_by",
    "extraction_verification_notes",
    "source_evidence_count",
    "missing_fields_count",
    "validation_issue_count",
  ],
};

const readOnlyFields = new Set([
  "history_id",
  "file_name",
  "source_sheet",
  "saved_at",
  "analyzed_at",
  "final_decision",
  "verification_mode",
  "reviewer_review_skipped_at",
  "reviewer_1_name",
  "reviewer_2_name",
  "reviewer_conflict_status",
  "ai_decision",
  "ai_confidence",
  "ai_review_score",
  "ai_review_grade",
  "extraction_verified",
  "extraction_verified_at",
  "extraction_verified_by",
  "extraction_verification_notes",
  "source_evidence_count",
  "missing_fields_count",
  "validation_issue_count",
]);

const projectFileSavedEventName = "wiregene-meta-project-file-saved";

export function MetaExtractionDatasetPanel({ extractionSections, projectId }: MetaExtractionDatasetPanelProps) {
  const [overview, setOverview] = useState<DatasetOverview | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editingRow, setEditingRow] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState(false);
  const [verifiedBy, setVerifiedBy] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportSaving, setExportSaving] = useState(false);
  const [xlsxDownloading, setXlsxDownloading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const sections = useMemo(() => [auditSection, ...extractionSections], [extractionSections]);
  const extractionColumns = useMemo(
    () => Array.from(new Set(extractionSections.flatMap((section) => section.fields).filter(Boolean))),
    [extractionSections],
  );
  const datasetApiUrl = useCallback(
    (format?: "xlsx") => {
      const searchParams = new URLSearchParams();
      if (projectId.trim()) searchParams.set("projectId", projectId.trim());
      if (extractionColumns.length) searchParams.set("columns", extractionColumns.join(","));
      if (format) searchParams.set("format", format);
      const query = searchParams.toString();
      return `/api/meta-analysis/extraction-dataset${query ? `?${query}` : ""}`;
    },
    [extractionColumns, projectId],
  );
  const selectedRecord = overview?.records.find((record) => record.id === selectedId) ?? null;
  const fieldSectionByName = useMemo(() => {
    const sectionByField = new Map<string, string>();
    for (const section of sections) {
      for (const field of section.fields) sectionByField.set(field, section.section);
    }
    return sectionByField;
  }, [sections]);
  const coverageRows = useMemo(() => {
    if (!overview) return [];
    return overview.columns
      .filter((field) => !readOnlyFields.has(field))
      .map((field) => {
        const counts: CoverageCounts = { evidenceBacked: 0, autoFilled: 0, manualRequired: 0, blank: 0 };
        for (const record of overview.records) {
          const status = record.fieldCoverage[field] ?? "blank";
          if (status === "evidence-backed") counts.evidenceBacked += 1;
          if (status === "auto-filled") counts.autoFilled += 1;
          if (status === "manual-required") counts.manualRequired += 1;
          if (status === "blank") counts.blank += 1;
        }
        return {
          field,
          section: fieldSectionByName.get(field) ?? "Other",
          counts,
        };
      });
  }, [fieldSectionByName, overview]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialDataset() {
      try {
        const payload = await readDatasetPayload(
          await fetch(datasetApiUrl(), { cache: "no-store" }),
        );
        if (cancelled) return;
        setOverview(payload);
        const firstRecord = payload.records[0];
        if (firstRecord) selectRecord(firstRecord);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Extraction dataset could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialDataset();
    return () => {
      cancelled = true;
    };
  }, [datasetApiUrl]);

  async function refreshDataset(preferredId = selectedId) {
    setLoading(true);
    setError("");
    try {
      const payload = await readDatasetPayload(
        await fetch(datasetApiUrl(), { cache: "no-store" }),
      );
      setOverview(payload);
      const nextRecord = payload.records.find((record) => record.id === preferredId) ?? payload.records[0];
      if (nextRecord) selectRecord(nextRecord);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction dataset could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function selectRecord(record: DatasetRecord) {
    setSelectedId(record.id);
    setEditingRow(record.row);
    setVerified(record.verified);
    setVerifiedBy(record.verifiedBy);
    setVerificationNotes(record.verificationNotes);
    setNotice("");
    setError("");
  }

  function updateField(field: string, value: string) {
    setEditingRow((current) => ({ ...current, [field]: value }));
  }

  async function saveDataset(markVerified = verified) {
    if (!overview || !selectedRecord) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const rowsForHistory = overview.records
        .filter((record) => record.historyId === selectedRecord.historyId)
        .sort((left, right) => left.rowIndex - right.rowIndex)
        .map((record) => (record.id === selectedRecord.id ? editingRow : record.row));
      const payload = await readDatasetPayload(
        await fetch(datasetApiUrl(), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            extractionColumns,
            historyId: selectedRecord.historyId,
            rows: rowsForHistory,
            verified: markVerified,
            verifiedBy,
            verificationNotes,
          }),
        }),
      );
      setOverview(payload);
      const nextRecord = payload.records.find((record) => record.id === selectedRecord.id) ?? payload.records[0];
      if (nextRecord) selectRecord(nextRecord);
      setNotice(
        `??μ셿猷? Excel dataset saved. Excel rows: ${payload.stats.excelRowCount}; verified: ${payload.stats.verifiedRowCount}; manual fields: ${payload.stats.manualRequiredFieldCount}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction dataset could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function copyCsv(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setNotice(`${label} copied to clipboard. Save verified rows before using them for final analysis.`);
  }

  async function saveDraftCsv() {
    if (!overview?.csv) return;
    setExportSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/meta-analysis/projects/${encodeURIComponent(projectId)}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "draft-excel-dataset.csv",
          contents: overview.csv,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ProjectFileSavePayload;
      if (!response.ok || !payload.savedFile) {
        throw new Error(payload.error || "Draft Excel CSV could not be saved.");
      }
      window.dispatchEvent(new CustomEvent(projectFileSavedEventName, { detail: { projectId } }));
      setNotice(`Draft Excel CSV saved to project folder: ${payload.savedFile.fileName}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Draft Excel CSV could not be saved.");
    } finally {
      setExportSaving(false);
    }
  }

  async function downloadXlsx() {
    if (!overview?.records.length) return;
    setXlsxDownloading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(datasetApiUrl("xlsx"), { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(payload, "Excel workbook could not be generated."));
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "wiregene-meta-extraction-dataset.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice(
        `Excel workbook generated. Excel rows: ${overview.stats.excelRowCount}; columns: ${overview.columns.length}; field coverage sheet included.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Excel workbook could not be generated.");
    } finally {
      setXlsxDownloading(false);
    }
  }

  const selectedCsv = selectedRecord && overview ? csvRows(overview.columns, [editingRow]) : "";

  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-900">Included-paper Excel dataset verification</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">AI가 채운 extraction field를 검증하고 실제 Excel workbook으로 생성합니다</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700">
            Included로 확정된 full-text 기록에서 AI extraction row를 모으고, 근거가 붙은 field, AI가 자동 입력한 field,
            수동 확인이 필요한 field, 빈 field를 나누어 보여줍니다. 검증 후에는 CSV 복사 없이 바로 .xlsx 파일로 내려받을 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshDataset()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void downloadXlsx()}
            disabled={!overview?.records.length || xlsxDownloading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {xlsxDownloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {xlsxDownloading ? "Generating..." : "Download Excel workbook (.xlsx)"}
          </button>
          <button
            type="button"
            onClick={() => void copyCsv(overview?.csv ?? "", "Draft Excel CSV")}
            disabled={!overview?.records.length}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Copy CSV
          </button>
          <button
            type="button"
            onClick={() => void saveDraftCsv()}
            disabled={!overview?.records.length || exportSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden />
            {exportSaving ? "Saving..." : "Save draft Excel CSV"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Included records" value={loading ? "..." : String(overview?.stats.includedRecordCount ?? 0)} />
        <Metric label="Excel rows" value={loading ? "..." : String(overview?.stats.excelRowCount ?? 0)} />
        <Metric label="Verified rows" value={loading ? "..." : String(overview?.stats.verifiedRowCount ?? 0)} />
        <Metric label="Evidence-backed fields" value={loading ? "..." : String(overview?.stats.evidenceBackedFieldCount ?? 0)} />
        <Metric label="AI auto-filled fields" value={loading ? "..." : String(overview?.stats.autoFilledFieldCount ?? 0)} />
        <Metric label="Manual-required flags" value={loading ? "..." : String(overview?.stats.manualRequiredFieldCount ?? 0)} />
        <Metric label="Blank editable fields" value={loading ? "..." : String(overview?.stats.blankFieldCount ?? 0)} />
        <Metric label="Editable field cells" value={loading ? "..." : String(overview?.stats.editableFieldCount ?? 0)} />
      </div>

      {overview?.records.length ? (
        <section className="mt-4 rounded-md border border-emerald-200 bg-white">
          <div className="border-b border-emerald-100 p-3">
            <p className="text-sm font-semibold text-zinc-950">Excel dataset preview before CSV copy</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Current workbook draft has {overview.stats.excelRowCount.toLocaleString("ko-KR")} row(s) and {overview.columns.length.toLocaleString("ko-KR")} column(s).
              The first five rows are shown as an audit preview before download.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2">File</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Decision</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Source sheet</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Evidence</th>
                  <th className="border-b border-zinc-200 px-3 py-2">AI filled</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Manual fields</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Verified</th>
                </tr>
              </thead>
              <tbody>
                {overview.records.slice(0, 5).map((record) => (
                  <tr key={record.id}>
                    <td className="border-b border-zinc-100 px-3 py-2 font-semibold text-zinc-950">{record.fileName}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{record.finalDecision}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{record.sourceSheet ?? "no sheet"}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{record.evidenceCount}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-sky-800">
                      {record.coverageCounts.evidenceBacked + record.coverageCounts.autoFilled}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{record.manualRequiredFields.length}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{record.verified ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {coverageRows.length ? (
        <section className="mt-4 rounded-md border border-emerald-200 bg-white">
          <div className="border-b border-emerald-100 p-3">
            <p className="text-sm font-semibold text-zinc-950">Excel field coverage map</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Each Excel column is classified across included rows so the extractor can see what AI filled, what has source evidence, and what still needs manual work.
            </p>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2">Field</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Section</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Evidence-backed</th>
                  <th className="border-b border-zinc-200 px-3 py-2">AI auto-filled</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Manual required</th>
                  <th className="border-b border-zinc-200 px-3 py-2">Blank</th>
                </tr>
              </thead>
              <tbody>
                {coverageRows.map((row) => (
                  <tr key={row.field}>
                    <td className="border-b border-zinc-100 px-3 py-2 font-semibold text-zinc-950">{row.field}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-600">{row.section}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-emerald-800">{row.counts.evidenceBacked}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-sky-800">{row.counts.autoFilled}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-amber-800">{row.counts.manualRequired}</td>
                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-500">{row.counts.blank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {notice ? <StatusMessage tone="success" message={notice} /> : null}
      {error ? <StatusMessage tone="error" message={error} /> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[22rem_1fr]">
        <section className="rounded-md border border-emerald-200 bg-white">
          <div className="border-b border-emerald-100 p-3">
            <p className="text-sm font-semibold text-zinc-950">Included full-text records</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">寃利앸맂 include ?쇰Ц留?Excel row ?꾨낫濡??섑??⑸땲??</p>
          </div>
          <div className="max-h-[34rem] overflow-y-auto p-2">
            {overview?.records.length ? (
              overview.records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => selectRecord(record)}
                  className={`mb-2 grid w-full gap-1 rounded-md border p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 ${
                    selectedId === record.id ? "border-emerald-400 bg-emerald-50" : "border-zinc-200 bg-white"
                  }`}
                >
                  <span className="truncate text-sm font-semibold text-zinc-950">{record.fileName}</span>
                  <span className="text-xs font-medium leading-5 text-zinc-600">
                    {record.sourceSheet ?? "no sheet"} 쨌 {record.finalDecision} 쨌 evidence {record.evidenceCount}
                  </span>
                  <span
                    className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${
                      record.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {record.verified ? "verified" : `${record.coverageCounts.evidenceBacked} evidence, ${record.coverageCounts.autoFilled} AI-filled, ${record.manualRequiredFields.length} manual flags`}
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-500">
                ?꾩쭅 include濡?寃利앸맂 full-text 湲곕줉???놁뒿?덈떎.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-md border border-emerald-200 bg-white">
          {selectedRecord ? (
            <>
              <div className="flex flex-col gap-3 border-b border-emerald-100 p-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">Excel row verification worksheet</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{selectedRecord.titleGuess || selectedRecord.fileName}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCsv(selectedCsv, "Selected Excel row CSV")}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <FileSpreadsheet className="h-4 w-4" aria-hidden />
                    Copy row CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDataset(false)}
                    disabled={saving}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerified(true);
                      void saveDataset(true);
                    }}
                    disabled={saving}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    )}
                    Save verified Excel data
                  </button>
                </div>
              </div>

              <div className="grid gap-3 border-b border-zinc-100 p-3 lg:grid-cols-[1fr_1fr]">
                <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                  verified by
                  <input
                    value={verifiedBy}
                    onChange={(event) => setVerifiedBy(event.target.value)}
                    className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-semibold normal-case text-zinc-900 outline-none focus:border-emerald-500"
                    placeholder="Reviewer or data extractor"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(event) => setVerified(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Mark row verified after checking full-text evidence
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500 lg:col-span-2">
                  verification notes
                  <textarea
                    value={verificationNotes}
                    onChange={(event) => setVerificationNotes(event.target.value)}
                    rows={3}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-900 outline-none focus:border-emerald-500"
                    placeholder="Record full-text page/table, RoB judgement evidence, publication-bias input notes, and manual corrections."
                  />
                </label>
              </div>

              <div className="grid gap-3 border-b border-zinc-100 p-3 lg:grid-cols-2">
                <ValidationList title="Manual required fields" items={selectedRecord.manualRequiredFields} />
                <ValidationList
                  title="AI validation / missing fields"
                  items={[...selectedRecord.missingCriticalFields, ...selectedRecord.validationIssues]}
                />
              </div>

              <div className="grid max-h-[46rem] gap-4 overflow-y-auto p-3">
                {sections.map((section) => (
                  <section key={section.section} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold text-zinc-950">{section.section}</p>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {section.fields.map((field) => (
                        <FieldEditor
                          key={field}
                          field={field}
                          value={editingRow[field] ?? ""}
                          readOnly={readOnlyFields.has(field)}
                          status={selectedRecord.fieldCoverage[field] ?? (readOnlyFields.has(field) ? "audit" : "blank")}
                          onChange={(value) => updateField(field, value)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="p-4 text-sm font-semibold text-zinc-500">Select an included paper to verify its Excel row.</div>
          )}
        </section>
      </div>
    </section>
  );
}

async function readDatasetPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(payload, "Extraction dataset could not be loaded."));
  return payload as DatasetOverview;
}

function FieldEditor({
  field,
  value,
  readOnly,
  status,
  onChange,
}: {
  field: string;
  value: string;
  readOnly: boolean;
  status: FieldCoverageStatus;
  onChange: (value: string) => void;
}) {
  const multiLine = /notes|quote|evidence|manual|required|covariates|definition|source|conflict|funding/i.test(field);
  const statusStyle = coverageStatusStyle(status);
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
      <span className="flex flex-wrap items-center gap-2">
        <span>{field}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case ${statusStyle}`}>
          {coverageStatusLabel(status)}
        </span>
      </span>
      {multiLine ? (
        <textarea
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className={`rounded-md border px-3 py-2 text-sm font-normal normal-case leading-6 text-zinc-900 outline-none focus:border-emerald-500 ${
            readOnly ? "border-zinc-200 bg-zinc-100 text-zinc-600" : "border-zinc-300 bg-white"
          }`}
        />
      ) : (
        <input
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          className={`h-10 rounded-md border px-3 text-sm font-semibold normal-case text-zinc-900 outline-none focus:border-emerald-500 ${
            readOnly ? "border-zinc-200 bg-zinc-100 text-zinc-600" : "border-zinc-300 bg-white"
          }`}
        />
      )}
    </label>
  );
}

function coverageStatusLabel(status: FieldCoverageStatus) {
  if (status === "evidence-backed") return "AI filled + evidence";
  if (status === "auto-filled") return "AI filled";
  if (status === "manual-required") return "manual check";
  if (status === "audit") return "audit";
  return "blank";
}

function coverageStatusStyle(status: FieldCoverageStatus) {
  if (status === "evidence-backed") return "bg-emerald-100 text-emerald-800";
  if (status === "auto-filled") return "bg-sky-100 text-sky-800";
  if (status === "manual-required") return "bg-amber-100 text-amber-900";
  if (status === "audit") return "bg-zinc-200 text-zinc-700";
  return "bg-zinc-100 text-zinc-500";
}

function ValidationList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {title}
      </p>
      {items.length ? (
        <ul className="mt-2 grid gap-1 text-xs font-semibold leading-5 text-amber-950">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-semibold text-emerald-800">No unresolved items.</p>
      )}
    </div>
  );
}

function StatusMessage({ tone, message }: { tone: "success" | "error"; message: string }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-white text-emerald-900"
      : "border-rose-200 bg-rose-50 text-rose-950";
  return <div className={`mt-3 rounded-md border p-3 text-sm font-semibold leading-6 ${styles}`}>{message}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-emerald-700">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">{value}</p>
    </div>
  );
}

function csvRows(columns: string[], rows: Record<string, string>[]) {
  return [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]
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
