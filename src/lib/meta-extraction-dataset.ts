import { orchestralPainProject } from "./meta-projects";
import {
  getMetaFullTextHistoryRecords,
  updateMetaFullTextExtractionReview,
  type MetaFullTextHistoryRecord,
} from "./meta-full-text-history";
import { cleanMetaProjectId, type MetaProjectScope } from "./meta-project-scope";

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
  fieldCoverage: Record<string, MetaExtractionFieldCoverageStatus>;
  coverageCounts: MetaExtractionCoverageCounts;
  row: Record<string, string>;
};

export type MetaExtractionFieldCoverageStatus = "audit" | "evidence-backed" | "auto-filled" | "manual-required" | "blank";

export type MetaExtractionCoverageCounts = {
  evidenceBacked: number;
  autoFilled: number;
  manualRequired: number;
  blank: number;
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
    evidenceBackedFieldCount: number;
    autoFilledFieldCount: number;
    blankFieldCount: number;
    editableFieldCount: number;
  };
  updatedAt: string;
};

export type MetaExtractionDatasetScope = MetaProjectScope & {
  extractionColumns?: string[] | null;
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
];

const defaultRiskOfBiasTool = "JBI Critical Appraisal Checklist for Studies Reporting Prevalence Data";
const defaultRiskOfBiasToolVersion = "JBI prevalence checklist 2020-08";

const jbiRiskOfBiasItemFields = [
  "rob_jbi_q1_sample_frame",
  "rob_jbi_q2_sampling",
  "rob_jbi_q3_sample_size",
  "rob_jbi_q4_subjects_setting",
  "rob_jbi_q5_sample_coverage",
  "rob_jbi_q6_condition_identification",
  "rob_jbi_q7_standard_measurement",
  "rob_jbi_q8_statistical_analysis",
  "rob_jbi_q9_response_rate",
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

export function metaExtractionDatasetColumns(extractionColumns?: string[] | null) {
  const projectColumns = normalizeExtractionColumns(extractionColumns);
  return [...auditColumns, ...projectColumns.filter((column) => !auditColumns.includes(column))];
}

export async function getMetaExtractionDatasetOverview(
  scope: MetaExtractionDatasetScope = {},
): Promise<MetaExtractionDatasetOverview> {
  const historyRecords = await getMetaFullTextHistoryRecords({ projectId: scope.projectId });
  const includedRecords = historyRecords.filter(isPrimaryQuantitativeIncludedRecord);
  const columns = metaExtractionDatasetColumns(scope.extractionColumns);
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
      evidenceBackedFieldCount: records.reduce((total, record) => total + record.coverageCounts.evidenceBacked, 0),
      autoFilledFieldCount: records.reduce((total, record) => total + record.coverageCounts.autoFilled, 0),
      blankFieldCount: records.reduce((total, record) => total + record.coverageCounts.blank, 0),
      editableFieldCount: records.length * columns.filter((column) => !auditColumns.includes(column)).length,
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
  projectId?: string | null;
}) {
  return updateMetaFullTextExtractionReview(input.historyId, {
    rows: input.rows,
    verified: Boolean(input.verified),
    verificationNotes: input.verificationNotes ?? "",
    verifiedBy: input.verifiedBy ?? "",
  }, { projectId: input.projectId });
}

function normalizeExtractionColumns(extractionColumns?: string[] | null) {
  const cleaned = Array.isArray(extractionColumns)
    ? Array.from(
        new Set(
          extractionColumns
            .map((column) => String(column).trim())
            .filter(Boolean),
        ),
      )
    : [];
  return cleaned.length ? cleaned : orchestralPainProject.extractionColumns;
}

function scopeProjectId(scope: MetaProjectScope = {}) {
  return cleanMetaProjectId(scope.projectId);
}

export function metaExtractionDatasetScope(input: MetaExtractionDatasetScope = {}): MetaExtractionDatasetScope {
  return {
    projectId: scopeProjectId(input),
    extractionColumns: normalizeExtractionColumns(input.extractionColumns),
  };
}

function datasetRecordsForHistoryRecord(record: MetaFullTextHistoryRecord, columns: string[]): MetaExtractionDatasetRecord[] {
  const sourceRows = record.extractionReview.rows.length
    ? record.extractionReview.rows
    : record.analysis.extraction.rows.length
      ? record.analysis.extraction.rows
      : [{}];

  return sourceRows.map((sourceRow, rowIndex) => {
    const normalizedSourceRow = normalizeDatasetRowDefaults(normalizeRow(sourceRow));
    const manualRequiredFields = manualRequiredFieldsFor(record, normalizedSourceRow);
    const manualRequiredFieldSet = new Set(manualRequiredFields);
    const evidenceFieldSet = new Set(
      record.analysis.extraction.fieldEvidence
        .filter((item) => item.rowIndex === rowIndex)
        .map((item) => item.field),
    );
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
    const fieldCoverage = Object.fromEntries(
      columns.map((column) => [
        column,
        fieldCoverageStatus(column, row[column] ?? "", manualRequiredFieldSet, evidenceFieldSet),
      ]),
    ) as Record<string, MetaExtractionFieldCoverageStatus>;
    const coverageCounts = coverageCountsFor(fieldCoverage);

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
      fieldCoverage,
      coverageCounts,
      row: Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])),
    };
  });
}

function fieldCoverageStatus(
  field: string,
  value: string,
  manualRequiredFieldSet: Set<string>,
  evidenceFieldSet: Set<string>,
): MetaExtractionFieldCoverageStatus {
  if (auditColumns.includes(field)) return "audit";
  if (manualRequiredFieldSet.has(field)) return "manual-required";
  if (!value) return "blank";
  if (evidenceFieldSet.has(field)) return "evidence-backed";
  return "auto-filled";
}

function coverageCountsFor(fieldCoverage: Record<string, MetaExtractionFieldCoverageStatus>): MetaExtractionCoverageCounts {
  const counts: MetaExtractionCoverageCounts = {
    evidenceBacked: 0,
    autoFilled: 0,
    manualRequired: 0,
    blank: 0,
  };
  for (const [field, status] of Object.entries(fieldCoverage)) {
    if (auditColumns.includes(field)) continue;
    if (status === "evidence-backed") counts.evidenceBacked += 1;
    if (status === "auto-filled") counts.autoFilled += 1;
    if (status === "manual-required") counts.manualRequired += 1;
    if (status === "blank") counts.blank += 1;
  }
  return counts;
}

export function isPrimaryQuantitativeIncludedRecord(record: MetaFullTextHistoryRecord) {
  const { verification } = record;
  if (verification.piFinalDecision === "include_quantitative") return true;
  if (verification.piFinalDecision !== "pending") return false;
  if (verification.verificationMode === "ai_only") return false;
  return (
    ["agreement", "resolved"].includes(verification.conflictStatus) &&
    verification.reviewerOneDecision === "include_quantitative" &&
    verification.reviewerTwoDecision === "include_quantitative"
  );
}

function finalDecision(record: MetaFullTextHistoryRecord) {
  if (record.verification.piFinalDecision !== "pending") {
    return record.verification.piFinalDecision;
  }

  if (record.verification.verificationMode === "ai_only") {
    return `ai_only_pending:${record.analysis.eligibility.decision}`;
  }

  if (record.verification.reviewerOneDecision === record.verification.reviewerTwoDecision) {
    return record.verification.reviewerOneDecision;
  }
  return record.verification.conflictStatus;
}

function manualRequiredFieldsFor(record: MetaFullTextHistoryRecord, row: Record<string, string>) {
  if (record.extractionReview.verified) return [];

  const fields = new Set<string>();
  for (const field of requiredManualReviewFields) {
    if (!row[field]) fields.add(field);
  }
  if (!hasRiskOfBiasOverallJudgement(row)) fields.add("rob_overall_judgement_or_rob_jbi_overall_risk");
  if (!hasRiskOfBiasEvidenceLocation(row)) fields.add("rob_evidence_location");
  if (!hasOutcomePair(row)) fields.add("at_least_one_region_n_total_pair");
  if (publicationBiasMarkedEligible(row) && !row.publication_bias_standard_error && !row.publication_bias_small_study_notes) {
    fields.add("publication_bias_standard_error_or_note");
  }
  if ((row.publication_bias_effect_size || row.publication_bias_standard_error) && !row.publication_bias_outcome_group) {
    fields.add("publication_bias_outcome_group");
  }
  for (const field of record.analysis.extraction.missingCriticalFields) {
    addUnresolvedMissingCriticalField(fields, field, row);
  }
  if (record.analysis.extraction.validationIssues.length > 0) fields.add("resolve_validation_issues");
  return [...fields];
}

function normalizeDatasetRowDefaults(row: Record<string, string>) {
  const next = { ...row };
  if (!next.risk_of_bias_tool) next.risk_of_bias_tool = defaultRiskOfBiasTool;
  if (!next.rob_jbi_tool_version && riskOfBiasToolIsJbi(next.risk_of_bias_tool)) {
    next.rob_jbi_tool_version = defaultRiskOfBiasToolVersion;
  }
  if (!next.rob_jbi_overall_risk && next.rob_overall_judgement) {
    next.rob_jbi_overall_risk = next.rob_overall_judgement;
  }
  if (!next.rob_overall_judgement && next.rob_jbi_overall_risk) {
    next.rob_overall_judgement = next.rob_jbi_overall_risk;
  }
  return next;
}

function addUnresolvedMissingCriticalField(fields: Set<string>, field: string, row: Record<string, string>) {
  const cleaned = field.trim();
  if (!cleaned) return;
  if (cleaned === "at_least_one_region_n_total_pair") {
    if (!hasOutcomePair(row)) fields.add(cleaned);
    return;
  }
  if (cleaned === "rob_evidence_location") {
    if (!hasRiskOfBiasEvidenceLocation(row)) fields.add(cleaned);
    return;
  }
  if (cleaned === "publication_bias_input_or_note") {
    if (publicationBiasMarkedEligible(row) && !row.publication_bias_standard_error && !row.publication_bias_small_study_notes) {
      fields.add("publication_bias_standard_error_or_note");
    }
    return;
  }
  if (cleaned === "rob_overall_judgement" || cleaned === "rob_jbi_overall_risk") {
    if (!hasRiskOfBiasOverallJudgement(row)) fields.add("rob_overall_judgement_or_rob_jbi_overall_risk");
    return;
  }
  if (row[cleaned]) return;
  fields.add(cleaned);
}

function hasRiskOfBiasOverallJudgement(row: Record<string, string>) {
  return Boolean(row.rob_overall_judgement || row.rob_jbi_overall_risk);
}

function hasRiskOfBiasEvidenceLocation(row: Record<string, string>) {
  return Boolean(
    row.rob_supporting_quote ||
      row.rob_page_table ||
      row.rob_jbi_notes ||
      jbiRiskOfBiasItemFields.some((field) => row[field]),
  );
}

function publicationBiasMarkedEligible(row: Record<string, string>) {
  const value = row.publication_bias_eligible_for_funnel?.trim().toLowerCase() ?? "";
  if (!value) return false;
  if (/\b(no|not eligible|ineligible|n\/a|na|not applicable|unclear|pending)\b/.test(value)) return false;
  return /^(yes|y|true|eligible|include|included|1)\b/.test(value);
}

function riskOfBiasToolIsJbi(value: string) {
  return /\bjbi\b/i.test(value) || /joanna\s+briggs/i.test(value);
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
