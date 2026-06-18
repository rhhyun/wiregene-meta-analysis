import { orchestralPainProject } from "./meta-projects";
import {
  getMetaFullTextHistoryRecords,
  updateMetaFullTextExtractionReview,
  type MetaFullTextHistoryRecord,
} from "./meta-full-text-history";

export type MetaExtractionDatasetRecord = {
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

export type MetaExtractionDatasetOverview = {
  columns: string[];
  records: MetaExtractionDatasetRecord[];
  csv: string;
  stats: {
    includedRecordCount: number;
    excelRowCount: number;
    verifiedRowCount: number;
    manualRequiredFieldCount: number;
  };
  updatedAt: string;
};

const auditColumns = [
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
];

const requiredManualReviewFields = [
  "study_id",
  "first_author",
  "year",
  "design",
  "sample_size_total",
  "specific_instrument",
  "mapped_asymmetry_group",
  "pain_definition",
  "recall_window",
  "risk_of_bias_tool",
  "rob_overall_judgement",
  "rob_supporting_quote",
  "publication_bias_eligible_for_funnel",
];

const outcomePairs = [
  ["neck_n", "neck_total"],
  ["left_shoulder_n", "left_shoulder_total"],
  ["right_shoulder_n", "right_shoulder_total"],
  ["shoulder_unspecified_n", "shoulder_unspecified_total"],
  ["left_elbow_n", "left_elbow_total"],
  ["right_elbow_n", "right_elbow_total"],
  ["elbow_unspecified_n", "elbow_unspecified_total"],
  ["left_wrist_hand_n", "left_wrist_hand_total"],
  ["right_wrist_hand_n", "right_wrist_hand_total"],
  ["wrist_hand_unspecified_n", "wrist_hand_unspecified_total"],
  ["upper_back_n", "upper_back_total"],
  ["lower_back_n", "lower_back_total"],
  ["tmj_jaw_n", "tmj_jaw_total"],
  ["headache_n", "headache_total"],
  ["performance_limitation_n", "performance_limitation_total"],
];

export function metaExtractionDatasetColumns() {
  return [...auditColumns, ...orchestralPainProject.extractionColumns.filter((column) => !auditColumns.includes(column))];
}

export async function getMetaExtractionDatasetOverview(): Promise<MetaExtractionDatasetOverview> {
  const historyRecords = await getMetaFullTextHistoryRecords();
  const includedRecords = historyRecords.filter(isIncludedRecord);
  const columns = metaExtractionDatasetColumns();
  const records = includedRecords.flatMap((record) => datasetRecordsForHistoryRecord(record, columns));
  return {
    columns,
    records,
    csv: csvRows(columns, records.map((record) => record.row)),
    stats: {
      includedRecordCount: includedRecords.length,
      excelRowCount: records.length,
      verifiedRowCount: records.filter((record) => record.verified).length,
      manualRequiredFieldCount: records.reduce((total, record) => total + record.manualRequiredFields.length, 0),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function saveMetaExtractionDatasetRecord(input: {
  historyId: string;
  rows: Record<string, string>[];
  verified?: boolean;
  verificationNotes?: string;
  verifiedBy?: string;
}) {
  return updateMetaFullTextExtractionReview(input.historyId, {
    rows: input.rows,
    verified: Boolean(input.verified),
    verificationNotes: input.verificationNotes ?? "",
    verifiedBy: input.verifiedBy ?? "",
  });
}

function datasetRecordsForHistoryRecord(record: MetaFullTextHistoryRecord, columns: string[]): MetaExtractionDatasetRecord[] {
  const sourceRows = record.extractionReview.rows.length
    ? record.extractionReview.rows
    : record.analysis.extraction.rows.length
      ? record.analysis.extraction.rows
      : [{}];

  return sourceRows.map((sourceRow, rowIndex) => {
    const normalizedSourceRow = normalizeRow(sourceRow);
    const manualRequiredFields = manualRequiredFieldsFor(record, normalizedSourceRow);
    const row = normalizeRow({
      ...normalizedSourceRow,
      history_id: record.id,
      file_name: record.fileName,
      source_sheet: record.sourceSheet ?? "",
      saved_at: record.savedAt,
      analyzed_at: record.analysis.analyzedAt,
      final_decision: finalDecision(record),
      verification_mode: record.verification.verificationMode,
      reviewer_review_skipped_at: record.verification.reviewerReviewSkippedAt ?? "",
      reviewer_1_name: record.verification.reviewerOneName,
      reviewer_2_name: record.verification.reviewerTwoName,
      reviewer_conflict_status: record.verification.conflictStatus,
      ai_decision: record.analysis.eligibility.decision,
      ai_confidence: String(record.analysis.eligibility.confidence),
      ai_review_score: String(record.analysis.reviewEvaluation.score),
      ai_review_grade: record.analysis.reviewEvaluation.grade,
      extraction_verified: record.extractionReview.verified ? "yes" : "no",
      extraction_verified_at: record.extractionReview.verifiedAt ?? "",
      extraction_verified_by: record.extractionReview.verifiedBy,
      extraction_verification_notes: record.extractionReview.verificationNotes,
      source_evidence_count: String(record.analysis.extraction.fieldEvidence.length),
      missing_fields_count: String(record.analysis.extraction.missingCriticalFields.length),
      validation_issue_count: String(record.analysis.extraction.validationIssues.length),
      manual_required_fields: normalizedSourceRow.manual_required_fields || manualRequiredFields.join("; "),
      data_verified: record.extractionReview.verified ? "yes" : normalizedSourceRow.data_verified || "no",
    });

    return {
      id: `${record.id}:${rowIndex}`,
      historyId: record.id,
      rowIndex,
      fileName: record.fileName,
      sourceSheet: record.sourceSheet,
      titleGuess: record.analysis.titleGuess,
      finalDecision: finalDecision(record),
      verified: record.extractionReview.verified,
      verifiedAt: record.extractionReview.verifiedAt,
      verifiedBy: record.extractionReview.verifiedBy,
      verificationNotes: record.extractionReview.verificationNotes,
      manualRequiredFields,
      validationIssues: record.analysis.extraction.validationIssues,
      missingCriticalFields: record.analysis.extraction.missingCriticalFields,
      evidenceCount: record.analysis.extraction.fieldEvidence.length,
      row: Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])),
    };
  });
}

function isIncludedRecord(record: MetaFullTextHistoryRecord) {
  if (record.verification.verificationMode === "ai_only") {
    return record.verification.piFinalDecision === "include_quantitative" || record.verification.piFinalDecision === "include_narrative_support";
  }

  const decisions = [record.verification.reviewerOneDecision, record.verification.reviewerTwoDecision];
  return (
    ["agreement", "resolved"].includes(record.verification.conflictStatus) &&
    decisions.every((decision) => decision === "include_quantitative" || decision === "include_narrative_support")
  );
}

function finalDecision(record: MetaFullTextHistoryRecord) {
  if (record.verification.verificationMode === "ai_only") {
    return record.verification.piFinalDecision !== "pending"
      ? record.verification.piFinalDecision
      : `ai_only_pending:${record.analysis.eligibility.decision}`;
  }

  if (record.verification.reviewerOneDecision === record.verification.reviewerTwoDecision) {
    return record.verification.reviewerOneDecision;
  }
  return record.verification.conflictStatus;
}

function manualRequiredFieldsFor(record: MetaFullTextHistoryRecord, row: Record<string, string>) {
  const fields = new Set<string>();
  for (const field of requiredManualReviewFields) {
    if (!row[field]) fields.add(field);
  }
  if (!hasOutcomePair(row)) fields.add("at_least_one_region_n_total_pair");
  if (!row.rob_supporting_quote && !row.rob_page_table) fields.add("rob_evidence_location");
  if (!row.publication_bias_standard_error && !row.publication_bias_small_study_notes) {
    fields.add("publication_bias_input_or_note");
  }
  for (const field of record.analysis.extraction.missingCriticalFields) fields.add(field);
  if (record.analysis.extraction.validationIssues.length > 0) fields.add("resolve_validation_issues");
  return [...fields];
}

function hasOutcomePair(row: Record<string, string>) {
  return outcomePairs.some(([numerator, denominator]) => Boolean(row[numerator]) && Boolean(row[denominator]));
}

function normalizeRow(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, cell]) => [key, cell == null ? "" : String(cell).trim()]));
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
