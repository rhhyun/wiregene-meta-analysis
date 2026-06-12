"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  row: Record<string, string>;
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
  };
  updatedAt: string;
};

type MetaExtractionDatasetPanelProps = {
  extractionSections: ExtractionSection[];
};

const auditSection: ExtractionSection = {
  section: "Saved audit trail",
  fields: [
    "history_id",
    "file_name",
    "source_sheet",
    "final_decision",
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
  "source_evidence_count",
  "missing_fields_count",
  "validation_issue_count",
]);

export function MetaExtractionDatasetPanel({ extractionSections }: MetaExtractionDatasetPanelProps) {
  const [overview, setOverview] = useState<DatasetOverview | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editingRow, setEditingRow] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState(false);
  const [verifiedBy, setVerifiedBy] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const sections = useMemo(() => [auditSection, ...extractionSections], [extractionSections]);
  const selectedRecord = overview?.records.find((record) => record.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadInitialDataset() {
      try {
        const payload = await readDatasetPayload(
          await fetch("/api/meta-analysis/extraction-dataset", { cache: "no-store" }),
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
  }, []);

  async function refreshDataset(preferredId = selectedId) {
    setLoading(true);
    setError("");
    try {
      const payload = await readDatasetPayload(
        await fetch("/api/meta-analysis/extraction-dataset", { cache: "no-store" }),
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
        await fetch("/api/meta-analysis/extraction-dataset", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
        `저장완료: Excel dataset saved. Excel rows: ${payload.stats.excelRowCount}; verified: ${payload.stats.verifiedRowCount}; manual fields: ${payload.stats.manualRequiredFieldCount}.`,
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

  const selectedCsv = selectedRecord && overview ? csvRows(overview.columns, [editingRow]) : "";

  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-900">Included-paper Excel dataset verification</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">자동 추출값을 검증하고 Excel-ready 데이터로 저장합니다</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-700">
            두 reviewer가 include로 검증한 full-text 기록만 모읍니다. 자동 입력된 값, RoB 근거, publication-bias 입력값,
            수동 확인이 필요한 빈칸을 한 행 단위로 확인한 뒤 저장합니다.
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
            onClick={() => void copyCsv(overview?.csv ?? "", "Full Excel CSV")}
            disabled={!overview?.records.length}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Copy full Excel CSV
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <Metric label="Included records" value={loading ? "..." : String(overview?.stats.includedRecordCount ?? 0)} />
        <Metric label="Excel rows" value={loading ? "..." : String(overview?.stats.excelRowCount ?? 0)} />
        <Metric label="Verified rows" value={loading ? "..." : String(overview?.stats.verifiedRowCount ?? 0)} />
        <Metric label="Manual fields" value={loading ? "..." : String(overview?.stats.manualRequiredFieldCount ?? 0)} />
      </div>

      {notice ? <StatusMessage tone="success" message={notice} /> : null}
      {error ? <StatusMessage tone="error" message={error} /> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[22rem_1fr]">
        <section className="rounded-md border border-emerald-200 bg-white">
          <div className="border-b border-emerald-100 p-3">
            <p className="text-sm font-semibold text-zinc-950">Included full-text records</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">검증된 include 논문만 Excel row 후보로 나타납니다.</p>
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
                    {record.sourceSheet ?? "no sheet"} · {record.finalDecision} · evidence {record.evidenceCount}
                  </span>
                  <span
                    className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${
                      record.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {record.verified ? "verified" : `${record.manualRequiredFields.length} manual fields`}
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-500">
                아직 include로 검증된 full-text 기록이 없습니다.
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
                    placeholder="원문 page/table, RoB 판단 근거, publication-bias 입력값 보완 사항을 기록하세요."
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
                          onChange={(value) => updateField(field, value)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="p-4 text-sm font-semibold text-zinc-500">검증할 include 논문을 선택하세요.</div>
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
  onChange,
}: {
  field: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const multiLine = /notes|quote|evidence|manual|required|covariates|definition|source|conflict|funding/i.test(field);
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
      {field}
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
