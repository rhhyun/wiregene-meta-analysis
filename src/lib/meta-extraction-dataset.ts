import { orchestralPainProject } from "./meta-projects";
import {
  getMetaFullTextHistoryRecord,
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

export type MetaExtractionParameterCode = {
  parameter: string;
  code: string;
  label: string;
  definition: string;
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
const datasetRowIndexPayloadField = "__dataset_row_index";

const professionalStatusCodeDefinition = "0=student/trainee; 1=professional; 2=mixed professional/student or mixed career status; 9=unclear/not reported";
const specificInstrumentCodeDefinition =
  "0=violin; 1=viola; 2=flute; 3=oboe; 4=cello; 5=double bass; 6=clarinet; 7=bassoon; 8=horn/brass; 9=piano; 10=guitar; 98=other; 99=mixed/unclear";
const instrumentCategoryCodeDefinition =
  "0=upper strings; 1=lower strings; 2=woodwind; 3=brass; 4=keyboard; 5=plucked strings; 6=percussion; 9=mixed/unclear";
const asymmetryGroupCodeDefinition = "0=low/mixed/orofacial/not classifiable; 1=moderate/seated axial-load; 2=high asymmetry; 9=unclear";

export const metaExtractionParameterCodebook: MetaExtractionParameterCode[] = [
  { parameter: "professional_status_code", code: "0", label: "student/trainee", definition: "Music student, trainee, college/university musician, or nonprofessional training population." },
  { parameter: "professional_status_code", code: "1", label: "professional", definition: "Professional, paid, employed, orchestra, or career musician sample." },
  { parameter: "professional_status_code", code: "2", label: "mixed", definition: "Mixed student/professional or mixed career-status sample that cannot be separated by outcome row." },
  { parameter: "professional_status_code", code: "9", label: "unclear/not reported", definition: "Professional status is absent or cannot be inferred from source evidence." },
  { parameter: "specific_instrument_code", code: "0", label: "violin", definition: "Violin." },
  { parameter: "specific_instrument_code", code: "1", label: "viola", definition: "Viola." },
  { parameter: "specific_instrument_code", code: "2", label: "flute", definition: "Flute." },
  { parameter: "specific_instrument_code", code: "3", label: "oboe", definition: "Oboe." },
  { parameter: "specific_instrument_code", code: "4", label: "cello", definition: "Cello." },
  { parameter: "specific_instrument_code", code: "5", label: "double bass", definition: "Double bass, contrabass, or upright bass." },
  { parameter: "specific_instrument_code", code: "6", label: "clarinet", definition: "Clarinet." },
  { parameter: "specific_instrument_code", code: "7", label: "bassoon", definition: "Bassoon." },
  { parameter: "specific_instrument_code", code: "8", label: "horn/brass", definition: "Horn, trumpet, trombone, tuba, or brass group when not separable." },
  { parameter: "specific_instrument_code", code: "9", label: "piano", definition: "Piano or keyboard piano group." },
  { parameter: "specific_instrument_code", code: "10", label: "guitar", definition: "Guitar, including classical guitar unless separately coded by a study-specific parameter." },
  { parameter: "specific_instrument_code", code: "98", label: "other", definition: "Other single instrument not covered by the default codebook." },
  { parameter: "specific_instrument_code", code: "99", label: "mixed/unclear", definition: "Multiple pooled instruments or unclear instrument information; preserve details in the label/notes fields." },
  { parameter: "instrument_category_code", code: "0", label: "upper strings", definition: "Violin/viola or comparable upper-string group." },
  { parameter: "instrument_category_code", code: "1", label: "lower strings", definition: "Cello/double bass or comparable lower-string group." },
  { parameter: "instrument_category_code", code: "2", label: "woodwind", definition: "Flute, oboe, clarinet, bassoon, or woodwind group." },
  { parameter: "instrument_category_code", code: "3", label: "brass", definition: "Horn, trumpet, trombone, tuba, or brass group." },
  { parameter: "instrument_category_code", code: "4", label: "keyboard", definition: "Piano or keyboard group." },
  { parameter: "instrument_category_code", code: "5", label: "plucked strings", definition: "Guitar, harp, mandolin, or comparable plucked-string group." },
  { parameter: "instrument_category_code", code: "6", label: "percussion", definition: "Percussion group." },
  { parameter: "instrument_category_code", code: "9", label: "mixed/unclear", definition: "Mixed, pooled, or unclear instrument category." },
  { parameter: "asymmetry_group_code", code: "0", label: "low/mixed/orofacial", definition: "Low asymmetry, mixed/unclassified, or primarily orofacial/TMJ load." },
  { parameter: "asymmetry_group_code", code: "1", label: "moderate", definition: "Moderate or seated axial-load asymmetry by the protocol mapping." },
  { parameter: "asymmetry_group_code", code: "2", label: "high", definition: "High asymmetry by the protocol mapping." },
  { parameter: "asymmetry_group_code", code: "9", label: "unclear", definition: "The asymmetry category is unclear from source evidence." },
  { parameter: "playing_hours_per_week", code: "daily x7", label: "daily-to-weekly", definition: "Reported daily practice/playing hours multiplied by 7." },
  { parameter: "playing_hours_per_week", code: "weekly", label: "weekly unchanged", definition: "Reported weekly hours used without conversion." },
  { parameter: "playing_hours_per_week", code: "monthly x12/52", label: "monthly-to-weekly", definition: "Reported monthly hours multiplied by 12/52." },
  { parameter: "playing_hours_per_week", code: "yearly /52", label: "yearly-to-weekly", definition: "Reported yearly hours divided by 52." },
];

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
  const record = await getMetaFullTextHistoryRecord(input.historyId, { projectId: input.projectId });
  if (!record) return null;
  return updateMetaFullTextExtractionReview(input.historyId, {
    rows: mergeExtractionReviewRows(record, input.rows),
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

function mergeExtractionReviewRows(record: MetaFullTextHistoryRecord, editedRows: Record<string, string>[]) {
  const analysisRows = record.analysis.extraction.rows.length ? record.analysis.extraction.rows : [{}];
  const reviewRows = record.extractionReview.rows;
  const baseLength = Math.max(1, analysisRows.length, reviewRows.length);
  const mergedRows = Array.from({ length: baseLength }, (_, index) => ({
    ...normalizeRow(analysisRows[index] ?? {}),
    ...normalizeRow(reviewRows[index] ?? {}),
  }));

  editedRows.forEach((row, fallbackIndex) => {
    const normalized = normalizeRow(row);
    const explicitIndex = Number.parseInt(normalized[datasetRowIndexPayloadField] ?? "", 10);
    delete normalized[datasetRowIndexPayloadField];
    const targetIndex = Number.isInteger(explicitIndex) && explicitIndex >= 0 ? explicitIndex : fallbackIndex;
    if (!mergedRows[targetIndex]) mergedRows[targetIndex] = {};
    mergedRows[targetIndex] = {
      ...mergedRows[targetIndex],
      ...normalized,
    };
  });

  return mergedRows.filter((row) => Object.values(row).some(Boolean));
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
  if (row.mean_age && !hasMeanAgeAnalysisSupport(row)) fields.add("mean_age_sd_se_ci_or_effect");
  if ((row.playing_hours || row.playing_hours_original) && !row.playing_hours_per_week && !row.playing_hours_conversion_rule) {
    fields.add("playing_hours_per_week_or_conversion_rule");
  }
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
  if (!next.professional_status_code_definition) next.professional_status_code_definition = professionalStatusCodeDefinition;
  if (!next.specific_instrument_code_definition) next.specific_instrument_code_definition = specificInstrumentCodeDefinition;
  if (!next.instrument_category_code_definition) next.instrument_category_code_definition = instrumentCategoryCodeDefinition;
  if (!next.asymmetry_group_code_definition) next.asymmetry_group_code_definition = asymmetryGroupCodeDefinition;
  if (!next.professional_status_code) next.professional_status_code = inferProfessionalStatusCode(next.professional_status);
  if (!next.playing_hours_original && next.playing_hours) next.playing_hours_original = next.playing_hours;
  if (!next.playing_hours_original_unit) next.playing_hours_original_unit = inferPlayingHoursUnit(next.playing_hours_original || next.playing_hours);
  const playingHoursConversion = normalizePlayingHoursPerWeek(next.playing_hours_original || next.playing_hours, next.playing_hours_original_unit);
  if (!next.playing_hours_per_week && playingHoursConversion.value) next.playing_hours_per_week = playingHoursConversion.value;
  if (!next.playing_hours_conversion_rule && playingHoursConversion.rule) next.playing_hours_conversion_rule = playingHoursConversion.rule;
  if (!next.specific_instrument_code) next.specific_instrument_code = inferSpecificInstrumentCode(next.specific_instrument || next.instrument_group_reported);
  if (!next.instrument_category_code) next.instrument_category_code = inferInstrumentCategoryCode(next.specific_instrument || next.instrument_group_reported);
  if (!next.asymmetry_group_code) next.asymmetry_group_code = inferAsymmetryGroupCode(next.mapped_asymmetry_group);
  if (!next.mean_age_source_unit && next.mean_age) next.mean_age_source_unit = "years";
  return next;
}

function hasMeanAgeAnalysisSupport(row: Record<string, string>) {
  return Boolean(
    row.mean_age_sd ||
      row.mean_age_se ||
      row.mean_age_ci_low ||
      row.mean_age_ci_high ||
      row.mean_age_effect_or ||
      row.mean_age_effect_ci_low ||
      row.mean_age_effect_ci_high ||
      row.mean_age_effect_p_value,
  );
}

function inferProfessionalStatusCode(value: string | undefined) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return "";
  const hasStudent = /\b(student|students|trainee|trainees|college|university|conservatory|undergraduate|graduate)\b/.test(normalized);
  const hasProfessional = /\b(professional|professionals|orchestra|orchestral|employed|career|working musician|paid musician)\b/.test(normalized);
  if (hasStudent && hasProfessional) return "2";
  if (/\b(mixed|both|combined|various)\b/.test(normalized)) return "2";
  if (hasStudent) return "0";
  if (hasProfessional) return "1";
  return "9";
}

function inferPlayingHoursUnit(value: string | undefined) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return "";
  if (/\b(per day|daily|day|days|h\/day|hr\/day|hrs\/day|hours\/day)\b/.test(normalized) || /\uC2DC\uAC04\/\uC77C/.test(normalized)) {
    return "per day";
  }
  if (/\b(per week|weekly|week|weeks|h\/week|hr\/week|hrs\/week|hours\/week)\b/.test(normalized) || /\uC2DC\uAC04\/\uC8FC/.test(normalized)) {
    return "per week";
  }
  if (/\b(per month|monthly|month|months|h\/month|hr\/month|hrs\/month|hours\/month)\b/.test(normalized)) {
    return "per month";
  }
  if (/\b(per year|yearly|annual|annually|year|years|h\/year|hr\/year|hrs\/year|hours\/year)\b/.test(normalized)) {
    return "per year";
  }
  return "unclear";
}

function normalizePlayingHoursPerWeek(rawValue: string | undefined, rawUnit: string | undefined) {
  const numericValue = parseHoursValue(rawValue);
  if (numericValue == null) return { value: "", rule: rawValue ? "numeric playing-hours value not safely extractable" : "" };

  const unit = inferPlayingHoursUnit(rawUnit && rawUnit !== "unclear" ? rawUnit : rawValue);
  if (unit === "per day") return { value: formatNumericCell(numericValue * 7), rule: "daily x7" };
  if (unit === "per week") return { value: formatNumericCell(numericValue), rule: "weekly unchanged" };
  if (unit === "per month") return { value: formatNumericCell((numericValue * 12) / 52), rule: "monthly x12/52" };
  if (unit === "per year") return { value: formatNumericCell(numericValue / 52), rule: "yearly /52" };
  return { value: "", rule: "playing-hours unit unclear; weekly conversion not performed" };
}

function parseHoursValue(value: string | undefined) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "");
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|to|~|\u2013|\u2014)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const low = Number.parseFloat(rangeMatch[1] ?? "");
    const high = Number.parseFloat(rangeMatch[2] ?? "");
    if (Number.isFinite(low) && Number.isFinite(high)) return (low + high) / 2;
  }
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function inferSpecificInstrumentCode(value: string | undefined) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return "";
  const matches = instrumentCodeMatches(normalized);
  if (matches.length === 1) return matches[0].code;
  if (matches.length > 1) return "99";
  if (/\b(mixed|multiple|various|orchestra|ensemble|all instruments)\b/.test(normalized)) return "99";
  return "98";
}

function inferInstrumentCategoryCode(value: string | undefined) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return "";
  const instrumentMatches = instrumentCodeMatches(normalized).map((match) => match.categoryCode);
  const unique = Array.from(new Set(instrumentMatches));
  if (unique.length === 1) return unique[0] ?? "";
  if (unique.length > 1) return "9";
  if (/\b(upper strings|violin|viola)\b/.test(normalized)) return "0";
  if (/\b(lower strings|cello|double bass|contrabass|upright bass)\b/.test(normalized)) return "1";
  if (/\b(woodwind|flute|oboe|clarinet|bassoon)\b/.test(normalized)) return "2";
  if (/\b(brass|horn|trumpet|trombone|tuba)\b/.test(normalized)) return "3";
  if (/\b(keyboard|piano)\b/.test(normalized)) return "4";
  if (/\b(plucked|guitar|harp|mandolin)\b/.test(normalized)) return "5";
  if (/\b(percussion|drum)\b/.test(normalized)) return "6";
  return "9";
}

function instrumentCodeMatches(value: string) {
  const instrumentCodes = [
    { pattern: /\bviolin(s|ists)?\b/, code: "0", categoryCode: "0" },
    { pattern: /\bviola(s|ists)?\b/, code: "1", categoryCode: "0" },
    { pattern: /\bflute(s|ists)?\b/, code: "2", categoryCode: "2" },
    { pattern: /\boboe(s|ists)?\b/, code: "3", categoryCode: "2" },
    { pattern: /\bcello(s|ists)?\b/, code: "4", categoryCode: "1" },
    { pattern: /\b(double bass|contrabass|upright bass)(es|ists)?\b/, code: "5", categoryCode: "1" },
    { pattern: /\bclarinet(s|ists)?\b/, code: "6", categoryCode: "2" },
    { pattern: /\bbassoon(s|ists)?\b/, code: "7", categoryCode: "2" },
    { pattern: /\b(horn|trumpet|trombone|tuba|brass)(s|ists)?\b/, code: "8", categoryCode: "3" },
    { pattern: /\bpiano(s|ists)?\b|\bkeyboard(s|ists)?\b/, code: "9", categoryCode: "4" },
    { pattern: /\bguitar(s|ists)?\b/, code: "10", categoryCode: "5" },
  ];
  return instrumentCodes.filter((item) => item.pattern.test(value));
}

function inferAsymmetryGroupCode(value: string | undefined) {
  const normalized = normalizeLooseText(value);
  if (!normalized) return "";
  if (/\b(high|upper string|violin|viola|asymmetric)\b/.test(normalized)) return "2";
  if (/\b(moderate|seated|axial|cello|piano)\b/.test(normalized)) return "1";
  if (/\b(low|mixed|orofacial|tmj|unclassified|other|not classifiable|unclear)\b/.test(normalized)) return "0";
  return "9";
}

function normalizeLooseText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatNumericCell(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
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
