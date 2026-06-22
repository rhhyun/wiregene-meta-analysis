import JSZip from "jszip";
import { metaExtractionParameterCodebook, type MetaExtractionDatasetOverview, type MetaExtractionDatasetRecord } from "./meta-extraction-dataset";

type WorkbookSheet = {
  name: string;
  rows: string[][];
};

export async function createMetaExtractionDatasetXlsx(overview: MetaExtractionDatasetOverview) {
  const zip = new JSZip();
  const datasetRows = rowsForColumns(overview.columns, overview.records);
  const studyRecords = uniqueRecordsByHistory(overview.records);
  const studyRows = rowsForColumns(studyLevelColumns, studyRecords);
  const resultRows = rowsForColumns(resultLevelColumns, overview.records);
  const riskPublicationBiasRows = rowsForColumns(riskPublicationBiasColumns, studyRecords);
  const codebookRows = [
    ["parameter", "code", "label", "definition"],
    ["sheet_role", "Dataset", "flat compatibility sheet", "All exported audit and extraction columns in the legacy one-table layout."],
    ["sheet_role", "Study_Level", "one row per paper", "Study-level characteristics for RoB, publication-bias eligibility, and article-level review."],
    ["sheet_role", "Result_Level", "one row per result", "Outcome, subgroup, instrument, asymmetry, effect-size, and comparison data for quantitative analysis."],
    ["sheet_role", "Risk_PubBias", "one row per paper", "Risk-of-bias and publication-bias inputs that should not be duplicated per result row."],
    ...metaExtractionParameterCodebook.map((item) => [item.parameter, item.code, item.label, item.definition]),
  ];
  const coverageRows = [
    ["file_name", "row_index", "field", "status", "value"],
    ...overview.records.flatMap((record) =>
      overview.columns.map((field) => [
        record.fileName,
        String(record.rowIndex + 1),
        field,
        record.fieldCoverage[field] ?? "blank",
        record.row[field] ?? "",
      ]),
    ),
  ];
  const sheets: WorkbookSheet[] = [
    { name: "Dataset", rows: datasetRows },
    { name: "Study_Level", rows: studyRows },
    { name: "Result_Level", rows: resultRows },
    { name: "Risk_PubBias", rows: riskPublicationBiasRows },
    { name: "Parameter_Codebook", rows: codebookRows },
    { name: "Field_Coverage", rows: coverageRows },
  ];

  zip.file("[Content_Types].xml", contentTypesXml(sheets.length));
  zip.folder("_rels")?.file(".rels", rootRelsXml());
  zip.folder("xl")?.file("workbook.xml", workbookXml(sheets));
  zip.folder("xl")?.file("styles.xml", stylesXml());
  zip.folder("xl")?.folder("_rels")?.file("workbook.xml.rels", workbookRelsXml(sheets.length));
  const worksheetsFolder = zip.folder("xl")?.folder("worksheets");
  sheets.forEach((sheet, index) => {
    worksheetsFolder?.file(`sheet${index + 1}.xml`, worksheetXml(sheet.rows));
  });

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

const studyLevelColumns = [
  "history_id",
  "file_name",
  "source_sheet",
  "saved_at",
  "analyzed_at",
  "final_decision",
  "extraction_verified",
  "extraction_verified_at",
  "extraction_verified_by",
  "study_id",
  "first_author",
  "year",
  "country",
  "design",
  "sample_size_total",
  "sample_size_analyzed",
  "population_source",
  "professional_status",
  "professional_status_code",
  "professional_status_code_definition",
  "professional_status_mixed_group_notes",
  "mean_age",
  "mean_age_sd",
  "mean_age_se",
  "mean_age_ci_low",
  "mean_age_ci_high",
  "mean_age_effect_or",
  "mean_age_effect_ci_low",
  "mean_age_effect_ci_high",
  "mean_age_effect_p_value",
  "mean_age_source_unit",
  "female_percent",
  "playing_hours",
  "playing_hours_original",
  "playing_hours_original_unit",
  "playing_hours_per_week",
  "playing_hours_conversion_rule",
  "years_experience",
  "instrument_group_reported",
  "specific_instrument",
  "specific_instrument_code",
  "specific_instrument_code_definition",
  "instrument_category_code",
  "instrument_category_code_definition",
  "mapped_asymmetry_group",
  "asymmetry_group_code",
  "asymmetry_group_code_definition",
  "mapping_confidence",
  "comparison_parameter_notes",
  "source_pdf_available",
  "manual_required_fields",
  "manual_verification_notes",
  "data_extractor",
  "data_verifier",
  "data_verified",
];

const resultLevelColumns = [
  "history_id",
  "file_name",
  "source_sheet",
  "study_id",
  "first_author",
  "year",
  "final_decision",
  "result_id",
  "result_level",
  "result_group_1_label",
  "result_group_1_code",
  "result_group_2_label",
  "result_group_2_code",
  "result_parameter_name",
  "result_parameter_code",
  "result_parameter_code_definition",
  "result_outcome_group",
  "result_effect_measure",
  "result_effect_value",
  "result_effect_ci_low",
  "result_effect_ci_high",
  "result_effect_standard_error",
  "result_effect_p_value",
  "specific_instrument",
  "specific_instrument_code",
  "instrument_category_code",
  "mapped_asymmetry_group",
  "asymmetry_group_code",
  "professional_status_code",
  "playing_hours_per_week",
  "recall_window",
  "pain_definition",
  "prmd_definition",
  "neck_n",
  "neck_total",
  "left_shoulder_n",
  "left_shoulder_total",
  "right_shoulder_n",
  "right_shoulder_total",
  "shoulder_unspecified_n",
  "shoulder_unspecified_total",
  "left_elbow_n",
  "left_elbow_total",
  "right_elbow_n",
  "right_elbow_total",
  "elbow_unspecified_n",
  "elbow_unspecified_total",
  "left_wrist_hand_n",
  "left_wrist_hand_total",
  "right_wrist_hand_n",
  "right_wrist_hand_total",
  "wrist_hand_unspecified_n",
  "wrist_hand_unspecified_total",
  "upper_back_n",
  "upper_back_total",
  "lower_back_n",
  "lower_back_total",
  "tmj_jaw_n",
  "tmj_jaw_total",
  "headache_n",
  "headache_total",
  "pain_intensity_mean",
  "pain_intensity_sd",
  "pain_interference_mean",
  "pain_interference_sd",
  "performance_limitation_n",
  "performance_limitation_total",
  "adjusted_or",
  "adjustment_covariates",
  "notes_on_extractability",
  "manual_required_fields",
  "data_verified",
];

const riskPublicationBiasColumns = [
  "history_id",
  "file_name",
  "source_sheet",
  "study_id",
  "first_author",
  "year",
  "final_decision",
  "risk_of_bias_tool",
  "rob_selection_recruitment",
  "rob_measurement_outcome",
  "rob_confounding_adjustment",
  "rob_missing_data",
  "rob_selective_reporting",
  "rob_overall_judgement",
  "rob_jbi_tool_version",
  "rob_jbi_q1_sample_frame",
  "rob_jbi_q2_sampling",
  "rob_jbi_q3_sample_size",
  "rob_jbi_q4_subjects_setting",
  "rob_jbi_q5_sample_coverage",
  "rob_jbi_q6_condition_identification",
  "rob_jbi_q7_standard_measurement",
  "rob_jbi_q8_statistical_analysis",
  "rob_jbi_q9_response_rate",
  "rob_jbi_yes_count",
  "rob_jbi_no_unclear_count",
  "rob_jbi_overall_risk",
  "rob_jbi_notes",
  "rob_supporting_quote",
  "rob_page_table",
  "response_rate",
  "funding_source",
  "conflict_of_interest",
  "publication_bias_outcome_group",
  "publication_bias_effect_size",
  "publication_bias_standard_error",
  "publication_bias_small_study_notes",
  "publication_bias_eligible_for_funnel",
  "manual_required_fields",
  "data_verified",
];

function rowsForColumns(columns: string[], records: MetaExtractionDatasetRecord[]) {
  return [columns, ...records.map((record) => columns.map((column) => record.row[column] ?? ""))];
}

function uniqueRecordsByHistory(records: MetaExtractionDatasetRecord[]) {
  const unique = new Map<string, MetaExtractionDatasetRecord>();
  for (const record of records) {
    if (!unique.has(record.historyId)) unique.set(record.historyId, record);
  }
  return [...unique.values()];
}

function contentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `  <Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("\n");
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheetOverrides}
</Types>`);
}

function rootRelsXml() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
}

function workbookXml(sheets: WorkbookSheet[]) {
  const sheetXml = sheets
    .map((sheet, index) => `    <sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("\n");
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheetXml}
  </sheets>
</workbook>`);
}

function workbookRelsXml(sheetCount: number) {
  const sheetRelationships = Array.from(
    { length: sheetCount },
    (_, index) =>
      `  <Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("\n");
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRelationships}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function stylesXml() {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
}

function worksheetXml(rows: string[][]) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const columnCount = Math.max(1, rows.reduce((max, row) => Math.max(max, row.length), 0));
  const rowCount = Math.max(1, rows.length);
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(columnCount)}${rowCount}"/>
  <sheetData>${rowXml}</sheetData>
</worksheet>`);
}

function columnName(index: number) {
  let value = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value || "A";
}

function escapeXml(value: string) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xml(value: string) {
  return value.trim();
}
