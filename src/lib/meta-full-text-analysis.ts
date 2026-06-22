import crypto from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import {
  metaAiSettingsErrorDetails,
  resolveMetaAiReviewerConfigs,
  type MetaAiReviewerConfig,
} from "./meta-ai-settings";
import { normalizeMetaFullTextResearcherGuidance } from "./meta-full-text-prompt-guidance";
import { extractPdfTextWithPdfParse } from "./pdf-text";
import { extractWordTextWithWordExtractor } from "./word-text";

export type MetaFullTextDecision =
  | "include_quantitative"
  | "include_narrative_support"
  | "exclude"
  | "uncertain";

export type MetaFullTextEvidence = {
  label: string;
  excerpt: string;
};

export type MetaFullTextFieldEvidence = {
  rowIndex: number;
  field: string;
  value: string;
  evidence: string;
  sourceHint: string | null;
  needsReview: boolean;
};

export type MetaFullTextFileType = "pdf" | "word" | "text";

export type MetaFullTextReviewCriterion = {
  score: number;
  status: string;
  comment: string;
};

export type MetaFullTextReviewEvaluation = {
  score: number;
  grade: string;
  summary: string;
  improvement: string;
  criteria: Record<string, MetaFullTextReviewCriterion>;
  modelName: string | null;
};

export type MetaFullTextPromptMetadata = {
  protocolVersion: string;
  promptVersion: string;
  promptSha256: string;
  researcherGuidanceSha256: string;
  extractionSchemaSha256: string;
};

export type MetaFullTextModelReview = {
  reviewerId: string;
  label: string;
  providerType: "OPENAI" | "OPENAI_COMPATIBLE";
  modelName: string;
  baseUrl: string | null;
  analysisSchemaVersion: string;
  promptMetadata: MetaFullTextPromptMetadata;
  analyzedAt: string;
  sourceFileSha256: string;
  inputTextLength: number;
  truncated: boolean;
  aiUsed: boolean;
  decision: MetaFullTextDecision;
  confidence: number;
  summary: string;
  reasons: string[];
  exclusionReasons: string[];
  reviewerChecks: MetaFullTextAnalysis["eligibility"]["reviewerChecks"];
  reviewScore: number;
  reviewGrade: string;
  extractionRowCount: number;
  missingCriticalFieldCount: number;
  validationIssueCount: number;
  extractionRows: Record<string, string>[];
  fieldEvidence: MetaFullTextFieldEvidence[];
  missingCriticalFields: string[];
  validationIssues: string[];
  warning: string | null;
};

export type MetaFullTextAnalysis = {
  fileName: string;
  fileType: MetaFullTextFileType;
  extractedTextLength: number;
  truncated: boolean;
  analysisSchemaVersion: string;
  sourceFileSha256: string;
  promptMetadata: MetaFullTextPromptMetadata;
  analyzedAt: string;
  aiUsed: boolean;
  model: string | null;
  aiConfigSource: "saved" | "environment" | "missing" | null;
  aiWarning: string | null;
  referenceRecord: string | null;
  researcherGuidance: string | null;
  titleGuess: string | null;
  eligibility: {
    decision: MetaFullTextDecision;
    confidence: number;
    summary: string;
    reasons: string[];
    exclusionReasons: string[];
    reviewerChecks: {
      originalObservationalData: boolean | null;
      instrumentOrGroupSpecificData: boolean | null;
      regionSpecificPainOutcome: boolean | null;
      extractableNumeratorDenominator: boolean | null;
      treatmentOrInterventionStudy: boolean | null;
      nonEnglishFullText: boolean | null;
    };
  };
  study: {
    design: string | null;
    country: string | null;
    population: string | null;
    sampleSizeTotal: string | null;
    instruments: string[];
    mappedAsymmetryGroup: string | null;
    recallWindow: string | null;
    painDefinition: string | null;
    prmdDefinition: string | null;
  };
  extraction: {
    columns: string[];
    rows: Record<string, string>[];
    fieldEvidence: MetaFullTextFieldEvidence[];
    missingCriticalFields: string[];
    validationIssues: string[];
  };
  evidence: MetaFullTextEvidence[];
  nextActions: string[];
  reviewEvaluation: MetaFullTextReviewEvaluation;
  modelReviews: MetaFullTextModelReview[];
};

export type AnalyzeMetaFullTextInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  referenceRecord?: string | null;
  extractionColumns: string[];
  reviewerIds?: string[] | null;
  researcherGuidance?: string | null;
};

type AiMetaFullTextReviewEvaluation = Partial<{
  score: number;
  grade: string;
  summary: string;
  improvement: string;
  criteria: Record<string, Partial<MetaFullTextReviewCriterion>>;
  modelName: string | null;
}>;

type AiMetaFullTextAnalysis = Partial<
  Pick<MetaFullTextAnalysis, "titleGuess" | "eligibility" | "study" | "extraction" | "evidence" | "nextActions"> & {
    reviewEvaluation: AiMetaFullTextReviewEvaluation;
  }
>;

const primitiveCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const metaFullTextAnalysisSchemaVersion = "2026-06-18-multi-ai-v1";
const musicianPrmdProtocolVersion = "musician-prmd-v1.0-2026-06-23";
const metaFullTextPromptVersion = "2026-06-23-musician-prmd-process-v1";
const recommendedGeminiReviewerModelName = "gemini-3.1-flash-lite";

function sha256Text(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractionSchemaHash(columns: string[]) {
  return sha256Text(JSON.stringify(columns));
}

function fallbackPromptMetadata(guidance: string | null | undefined, extractionColumns: string[]): MetaFullTextPromptMetadata {
  const normalizedGuidance = normalizeMetaFullTextResearcherGuidance(guidance);
  return {
    protocolVersion: musicianPrmdProtocolVersion,
    promptVersion: metaFullTextPromptVersion,
    promptSha256: "",
    researcherGuidanceSha256: sha256Text(normalizedGuidance),
    extractionSchemaSha256: extractionSchemaHash(extractionColumns),
  };
}

function promptMetadata(
  prompt: string,
  guidance: string,
  extractionColumns: string[],
): MetaFullTextPromptMetadata {
  return {
    protocolVersion: musicianPrmdProtocolVersion,
    promptVersion: metaFullTextPromptVersion,
    promptSha256: sha256Text(prompt),
    researcherGuidanceSha256: sha256Text(guidance),
    extractionSchemaSha256: extractionSchemaHash(extractionColumns),
  };
}
const aiReviewCriterionSchema = z
  .object({
    score: z.coerce.number().optional(),
    status: z.string().optional(),
    comment: z.string().optional(),
  })
  .passthrough();
const aiMetaFullTextAnalysisSchema = z
  .object({
    titleGuess: z.string().nullable().optional(),
    eligibility: z
      .object({
        decision: z.enum(["include_quantitative", "include_narrative_support", "exclude", "uncertain"]).optional(),
        confidence: z.coerce.number().optional(),
        summary: z.string().optional(),
        reasons: z.array(z.string()).optional(),
        exclusionReasons: z.array(z.string()).optional(),
        reviewerChecks: z
          .object({
            originalObservationalData: z.boolean().nullable().optional(),
            instrumentOrGroupSpecificData: z.boolean().nullable().optional(),
            regionSpecificPainOutcome: z.boolean().nullable().optional(),
            extractableNumeratorDenominator: z.boolean().nullable().optional(),
            treatmentOrInterventionStudy: z.boolean().nullable().optional(),
            nonEnglishFullText: z.boolean().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
    study: z
      .object({
        design: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        population: z.string().nullable().optional(),
        sampleSizeTotal: z.string().nullable().optional(),
        instruments: z.array(z.string()).optional(),
        mappedAsymmetryGroup: z.string().nullable().optional(),
        recallWindow: z.string().nullable().optional(),
        painDefinition: z.string().nullable().optional(),
        prmdDefinition: z.string().nullable().optional(),
      })
      .optional(),
    extraction: z
      .object({
        rows: z.array(z.record(z.string(), primitiveCellSchema)).optional(),
        fieldEvidence: z
          .array(
            z.object({
              rowIndex: z.coerce.number(),
              field: z.string(),
              value: primitiveCellSchema.optional(),
              evidence: z.string(),
              sourceHint: z.string().nullable().optional(),
              needsReview: z.boolean().optional(),
            }),
          )
          .optional(),
        missingCriticalFields: z.array(z.string()).optional(),
        validationIssues: z.array(z.string()).optional(),
      })
      .optional(),
    evidence: z.array(z.object({ label: z.string(), excerpt: z.string() })).optional(),
    nextActions: z.array(z.string()).optional(),
    reviewEvaluation: z
      .object({
        score: z.coerce.number().optional(),
        grade: z.string().optional(),
        summary: z.string().optional(),
        improvement: z.string().optional(),
        criteria: z.record(z.string(), aiReviewCriterionSchema).optional(),
        modelName: z.string().nullable().optional(),
      })
      .optional(),
  })
  .passthrough();

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceAiMetaFullTextAnalysisCandidate(value: unknown): unknown {
  if (!isUnknownRecord(value)) return value;
  const draft: UnknownRecord = { ...value };

  if ("eligibility" in draft) draft.eligibility = coerceAiEligibility(draft.eligibility);
  if ("study" in draft) draft.study = coerceAiStudy(draft.study);
  draft.extraction = coerceAiExtraction(draft.extraction);
  draft.evidence = coerceAiEvidence(draft.evidence);
  draft.nextActions = coerceStringList(draft.nextActions);
  draft.reviewEvaluation = coerceAiReviewEvaluation(draft.reviewEvaluation);

  return draft;
}

function coerceAiEligibility(value: unknown) {
  if (!isUnknownRecord(value)) return value;
  const reviewerChecks = isUnknownRecord(value.reviewerChecks) ? value.reviewerChecks : {};
  return {
    ...value,
    decision: coerceEligibilityDecision(value.decision),
    confidence: coerceConfidenceScore(value.confidence),
    summary: coerceOptionalString(value.summary),
    reasons: coerceStringList(value.reasons),
    exclusionReasons: coerceStringList(value.exclusionReasons),
    reviewerChecks: {
      originalObservationalData: coerceNullableBoolean(reviewerChecks.originalObservationalData),
      instrumentOrGroupSpecificData: coerceNullableBoolean(reviewerChecks.instrumentOrGroupSpecificData),
      regionSpecificPainOutcome: coerceNullableBoolean(reviewerChecks.regionSpecificPainOutcome),
      extractableNumeratorDenominator: coerceNullableBoolean(reviewerChecks.extractableNumeratorDenominator),
      treatmentOrInterventionStudy: coerceNullableBoolean(reviewerChecks.treatmentOrInterventionStudy),
      nonEnglishFullText: coerceNullableBoolean(reviewerChecks.nonEnglishFullText),
    },
  };
}

function coerceAiStudy(value: unknown) {
  if (!isUnknownRecord(value)) return value;
  return {
    ...value,
    instruments: coerceStringList(value.instruments),
  };
}

function coerceAiExtraction(value: unknown) {
  const inputWasString = typeof value === "string" ? value : "";
  const source = isUnknownRecord(value) ? value : {};
  const rowsValue = source.rows ?? source.row ?? source.data ?? source.extractedData ?? source.extractionRows ?? value;

  return {
    ...source,
    rows: coerceExtractionRows(rowsValue),
    fieldEvidence: coerceFieldEvidence(
      source.fieldEvidence ?? source.cellEvidence ?? source.field_evidence ?? source.evidenceByField,
    ),
    missingCriticalFields: coerceStringList(
      source.missingCriticalFields ?? source.missing_fields ?? source.missingCritical ?? source.missing,
    ),
    validationIssues: normalizeList([...coerceStringList(source.validationIssues ?? source.issues), inputWasString]),
  };
}

function coerceExtractionRows(value: unknown) {
  const rawRows = Array.isArray(value) ? value : isUnknownRecord(value) ? coerceRecordRows(value) : [];
  return rawRows.flatMap((item) => {
    if (!isUnknownRecord(item)) return [];
    return [
      Object.fromEntries(
        Object.entries(item).map(([key, cell]) => [String(key), coercePrimitiveCell(cell)]),
      ),
    ];
  });
}

function coerceRecordRows(value: UnknownRecord) {
  const entries = Object.entries(value);
  if (entries.length === 0) return [];
  const looksLikeIndexedRows = entries.every(([key, item]) => /^\d+$/.test(key) && isUnknownRecord(item));
  return looksLikeIndexedRows ? entries.map(([, item]) => item) : [value];
}

function coerceFieldEvidence(value: unknown) {
  const items = Array.isArray(value)
    ? value
    : isUnknownRecord(value)
      ? Object.entries(value).map(([field, evidence]) => ({ field, evidence }))
      : [];

  return items.map((item) => {
    const record = isUnknownRecord(item) ? item : {};
    const rowIndex = Number(record.rowIndex ?? record.row ?? record.row_index ?? 0);
    const field = coerceString(record.field ?? record.fieldName ?? record.column ?? record.parameter ?? record.variable);
    const evidence = coerceString(
      record.evidence ?? record.excerpt ?? record.quote ?? record.sourceText ?? record.rationale ?? record.support,
    );
    return {
      rowIndex: Number.isFinite(rowIndex) && rowIndex >= 0 ? Math.floor(rowIndex) : 0,
      field,
      value: coercePrimitiveCell(record.value ?? record.extractedValue ?? record.cellValue),
      evidence,
      sourceHint: coerceNullableString(record.sourceHint ?? record.source ?? record.page ?? record.table ?? null),
      needsReview: coerceBoolean(record.needsReview ?? record.needs_review) ?? true,
    };
  });
}

function coerceAiEvidence(value: unknown) {
  const items = Array.isArray(value)
    ? value
    : isUnknownRecord(value)
      ? Object.entries(value).map(([label, excerpt]) => ({ label, excerpt }))
      : [];

  return items.map((item, index) => {
    const record = isUnknownRecord(item) ? item : {};
    return {
      label: coerceString(record.label ?? record.name ?? `evidence_${index + 1}`),
      excerpt: coerceString(record.excerpt ?? record.quote ?? record.text ?? record.evidence),
    };
  });
}

function coerceAiReviewEvaluation(value: unknown) {
  if (!isUnknownRecord(value)) return value;
  return {
    ...value,
    score: coerceReviewQualityScore(value.score),
    grade: coerceOptionalString(value.grade),
    summary: coerceOptionalString(value.summary),
    improvement: coerceOptionalString(value.improvement),
    criteria: coerceReviewCriteria(value.criteria),
  };
}

function coerceReviewCriteria(value: unknown) {
  if (isUnknownRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, criterion]) => [key, coerceReviewCriterion(criterion)]),
    );
  }
  if (!Array.isArray(value)) return value;
  return Object.fromEntries(
    value.flatMap((item, index) => {
      if (!isUnknownRecord(item)) return [];
      const key = coerceString(item.key ?? item.name ?? item.criterion ?? `criterion_${index + 1}`);
      return key ? [[key, coerceReviewCriterion(item)]] : [];
    }),
  );
}

function coerceReviewCriterion(value: unknown) {
  if (!isUnknownRecord(value)) {
    return { score: 0, status: "unclear", comment: coerceString(value) };
  }
  return {
    ...value,
    score: coerceReviewQualityScore(value.score),
    status: coerceOptionalString(value.status),
    comment: coerceOptionalString(value.comment),
  };
}

function coercePrimitiveCell(value: unknown) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean | null;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function coerceStringList(value: unknown) {
  if (Array.isArray(value)) return normalizeList(value);
  if (value === null || value === undefined || value === "") return [];
  if (isUnknownRecord(value)) return normalizeList(Object.values(value));
  return normalizeList([value]);
}

function coerceEligibilityDecision(value: unknown) {
  const normalized = coerceString(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (normalized.includes("narrative") || normalized.includes("support")) return "include_narrative_support";
  if (normalized.includes("quantitative") || normalized === "include" || normalized === "included") {
    return "include_quantitative";
  }
  if (normalized.includes("exclude") || normalized === "excluded") return "exclude";
  if (normalized.includes("uncertain") || normalized.includes("pending") || normalized.includes("maybe")) {
    return "uncertain";
  }
  return undefined;
}

function coerceNumericScore(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  const numeric = normalized.match(/-?\d+(?:\.\d+)?/);
  if (numeric) return Number(numeric[0]);
  if (normalized.includes("high")) return 85;
  if (normalized.includes("moderate") || normalized.includes("medium")) return 60;
  if (normalized.includes("low")) return 30;
  if (normalized.includes("unsafe") || normalized.includes("fail")) return 10;
  return undefined;
}

function normalizeZeroToHundredScore(value: number | undefined, options: { oneScale?: boolean; fiveScale?: boolean; tenScale?: boolean } = {}) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (options.oneScale && value > 0 && value <= 1) return Math.round(value * 100);
  if (options.fiveScale && value > 0 && value <= 5) return Math.round(value * 20);
  if (options.tenScale && value > 0 && value <= 10) return Math.round(value * 10);
  return Math.round(value);
}

function coerceConfidenceScore(value: unknown) {
  return normalizeZeroToHundredScore(coerceNumericScore(value), { oneScale: true });
}

function coerceReviewQualityScore(value: unknown) {
  return normalizeZeroToHundredScore(coerceNumericScore(value), { fiveScale: true, tenScale: true });
}

function coerceString(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function coerceOptionalString(value: unknown) {
  return value === undefined ? undefined : coerceString(value);
}

function coerceNullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return coerceString(value);
}

function coerceBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "pass", "included"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "fail", "excluded"].includes(normalized)) return false;
  return null;
}

function coerceNullableBoolean(value: unknown) {
  return coerceBoolean(value);
}

function summarizeSchemaErrors(fieldErrors: Record<string, string[] | undefined>) {
  const summary = Object.entries(fieldErrors)
    .flatMap(([field, errors]) => (errors?.length ? [`${field}: ${errors.join(", ")}`] : []))
    .join("; ");
  return summary || "unknown schema mismatch";
}

const defaultCriticalFields = [
  "study_id",
  "first_author",
  "year",
  "design",
  "sample_size_total",
  "specific_instrument",
  "mapped_asymmetry_group",
  "recall_window",
  "pain_definition",
];

const defaultOpenAiFullTextCharacterLimit = 65_000;
const openAiFullTextKeywordPattern =
  /(?:abstract|method|methods|participants|respondents|sample|survey|questionnaire|result|results|prevalence|pain|musculoskeletal|PRMD|injury|risk\s+factor|correlation|regression|instrument|guitar|classical\s+guitar|bassoon|bassoonist|violin|viola|cello|piano|pianist|orchestra|table|figure|appendix|thenar|posterior\s+neck|lower\s+back|occupational\s+health|neck|cervical|shoulder|interscapular|shoulder\s+blades|head\s+or\s+neck|back.*chest.*shoulder|arms?\s+or\s+wrists?|legs?\s+or\s+hips?|hands|finger|fingers|neutral\s+arm|elevated\s+arm|work\s+postures|posture|playing\s+time|pain\s+while\s+playing|pain\s+after\s+playing|pain\s+site|pain\s+location|VAS|NDI|SF-36|quality\s+of\s+life|disability|symptomatic|attrition|student|students|college|university|sex|gender|male|female|missing|location|diagnosed|Yates|chi[-\s]?square|cohort|overlap|discussion|conclusion)/gi;

const instrumentTerms = [
  "violin",
  "viola",
  "cello",
  "double bass",
  "contrabass",
  "flute",
  "guitar",
  "mandolin",
  "clarinet",
  "oboe",
  "bassoon",
  "trumpet",
  "trombone",
  "horn",
  "percussion",
  "piano",
  "harp",
  "brass",
  "woodwind",
  "string",
];

const regionTerms = [
  "neck",
  "shoulder",
  "elbow",
  "forearm",
  "wrist",
  "hand",
  "back",
  "lumbar",
  "thoracic",
  "tmj",
  "jaw",
  "headache",
];

const metaReviewEvaluationCriteria = {
  eligibility_fit:
    "Full text eligibility matches the review protocol: original observational musician data, relevant PRMD/pain outcome, no intervention/review/case-report exclusion.",
  extraction_completeness:
    "Critical Excel fields and at least one useful denominator-based outcome row are extracted when the article supports inclusion.",
  evidence_traceability:
    "Key eligibility and numeric extraction claims have short source excerpts plus page/table/figure/supplement hints when available.",
  quantitative_integrity:
    "Numerators, denominators, percentages, totals, laterality, and instrument-group mappings are not invented and pass internal consistency checks.",
  reviewer_actionability:
    "The output tells the human reviewer exactly what to verify, correct, include, or exclude next.",
  risk_visibility:
    "Uncertainty, OCR/table limitations, non-English risk, treatment/intervention design, overlap cohorts, and missing denominators are explicitly visible.",
};

const metaFullTextScoringRules = [
  "These scoring and selection rules are scoped to the current Musician PRMD pain prevalence project, not to unrelated reviews.",
  "Current status should be treated as AI full-text triage/extraction drafting. Screening is not complete until reviewer 1, reviewer 2, and PI adjudication are locked.",
  "Preserve AI-only model drafts and human-reviewed adjudications as parallel evidence streams for later model-performance comparison.",
  "Treatment-effect RCTs are excluded from the primary prevalence meta-analysis, but independently extractable baseline epidemiologic denominators/outcomes can be retained as secondary evidence if explicitly reported.",
  "Risk-of-bias method lock: use the JBI Critical Appraisal Checklist for Studies Reporting Prevalence Data as the primary RoB tool for quantitative-included Musician PRMD prevalence records.",
  "Apply JBI prevalence Q1 sample frame, Q2 sampling/recruitment, Q3 sample size, Q4 subject/setting description, Q5 sample coverage, Q6 valid condition identification, Q7 standard/reliable measurement, Q8 appropriate statistical analysis, and Q9 response rate/nonresponse handling.",
  "Treat JBI Q6 and Q7 as critical for pain/PRMD prevalence. If either is no or unclear, downgrade quantitative interpretation and flag manual verification even when n/total values are extractable.",
  "Overall JBI prevalence RoB rule: low generally requires at least 7 yes answers and yes for Q6 and Q7; moderate generally has 5-6 yes answers or one critical measurement concern; high generally has 0-4 yes answers, unresolved denominator/case-definition problems, or no/unclear Q6 and Q7; unclear means the full text cannot support a stable judgement.",
  "Use JBI Analytical Cross Sectional or AXIS only as secondary/narrative appraisal for analytical risk-factor-only evidence. Do not default to RoB 2 or ROBINS-I for the primary prevalence dataset.",
  "eligibility.confidence is a 0-100 percentage for the AI eligibility decision, not a 0-1 probability. Return 96 for 96% confidence; do not return 0.96.",
  "reviewEvaluation.score and each criterion score are 0-100 quality scores for the AI screening/extraction output, not a 1-5 score. Convert 4/5 to 80 before returning JSON.",
  "Grade mapping: high=85-100 with no major unresolved issue; moderate=65-84 or usable with limited missing fields; low=40-64 or major manual checks needed; unsafe=0-39, fallback, failed, or not usable for decisions.",
  "Quantitative inclusion should be selected only when decision=include_quantitative, confidence>=80, reviewEvaluation.score>=65, grade is high or moderate, denominator/numerator or prevalence is extractable, numeric fieldEvidence is present, and the outcome can be mapped to the protocol's primary region/laterality rows.",
  "Do not downgrade an instrument-specific observational study only because it is not a core orchestral comparative study. Core comparative status and instrument-specific quantitative eligibility are separate labels.",
  "If site/laterality n/total values are present in a table or appendix, table extraction incompleteness is an extraction quality problem, not an eligibility exclusion reason. Keep the article as a quantitative candidate and list the exact table to verify.",
  "If only the highest-prevalence body sites are reported, extract the reported sites and mark unreported sites as NR. Never code unreported contralateral or lower-prevalence sites as 0.",
  "If numerator and percentage disagree for an overall prevalence value, flag a numerator-percentage discrepancy and avoid using that overall value as final, but still use internally consistent site-specific rows.",
  "For classical guitar papers, keep asymmetry_group unclassified/other unless the protocol has a predefined guitar class; do not force a guitar paper into high/moderate/low asymmetry by intuition.",
  "Zuhdi et al. 2020 calibration: Occupational Health Problems of Classical Guitarists is an instrument-specific observational quantitative candidate when Table 5 is available; denominator n=190, top 22 site/laterality pain counts should be extracted, overall 168/190 vs 88.9% should be flagged, and unreported sites remain NR.",
  "If the only reported pain outcome is a composite anatomical outcome, such as neck-shoulder complaint or neck/shoulder/interscapular pain combined, and separate anatomical and laterality-specific estimates are absent, exclude it from the primary region/laterality quantitative meta-analysis even when group n/percent values can be reconstructed.",
  "For otherwise relevant composite-outcome papers, choose include_narrative_support or record primary-analysis exclusion with secondary/narrative inclusion. Extract reconstructable group n/total values as secondary evidence only.",
  "When exposure groups combine instrument type with posture, arm elevation, or playing time, keep the original group label and do not reinterpret the result as a pure asymmetry effect. Do not split pooled violin/viola or similar pooled instruments unless separate values are reported.",
  "Nyman et al. 2007 calibration: Work Postures and Neck-Shoulder Pain Among Orchestra Musicians has useful orchestra/posture groups and reconstructable Table II cases, but the outcome is current composite neck, shoulder, or interscapular pain with no separate anatomical or left/right estimates. Primary region/laterality meta-analysis should be excluded; retain for narrative or secondary composite-outcome synthesis.",
  "If participants were selected because they already had pain or disability, do not code all included participants as prevalence cases. Symptomatic cohorts and case-only samples lack a valid at-risk source population denominator for primary prevalence meta-analysis.",
  "Continuous outcomes such as VAS, NDI, SF-36, quality-of-life, severity, or disability mean scores are not pain_n/total_n prevalence data. Keep them only for narrative synthesis or a separately prespecified continuous-outcome analysis.",
  "Classify the actual recruited population, not title wording. A sample of music college students remains student/trainee status even if the title says professional musicians.",
  "Flag attrition, outcome-related dropout, and unclear stage-specific instrument sample sizes; do not use final completers as the denominator for prevalence when eligibility/enrollment flow shows selected symptomatic participants.",
  "Piatkowska et al. 2016 calibration: Cervical Pain in Young Professional Musicians - Quality of Life is a repeated-measures symptomatic cohort of music students preselected for cervical pain. It reports instrument-specific VAS/NDI/SF-36 means but no valid pain-case numerator/denominator from an at-risk source population. Exclude from primary prevalence meta-analysis; retain only for narrative or separately prespecified continuous-outcome synthesis.",
  "If prevalence values are reported only for broad body-region groups joined by 'or', such as head or neck, back/chest/shoulders, arms or wrists, or legs or hips, do not split them into standard anatomical site rows.",
  "If a PRMD/injury prevalence outcome lacks a fixed recall window or mixes current, past, diagnosed injury, self-reported symptoms, and location-only responses, do not combine it with point, 7-day, 12-month, or lifetime pain prevalence unless the article explicitly defines the time window and case definition.",
  "Graph-reconstructed numerators can be retained as supplementary quantitative evidence when internally checked, but graph-only broad-region values without laterality and fixed timeframe are not primary site/laterality prevalence rows.",
  "Flag differential missingness in body-location responses across sex or other subgroups; do not interpret such body-region differences as clean subgroup effects.",
  "Check for overlapping cohorts or secondary analyses from the same questionnaire/sample and do not pool related reports as independent studies.",
  "Brusky 2010 calibration: The High Prevalence of Injury Among Female Bassoonists is a nonprobability online bassoonist survey with limited supplementary sex-stratified broad-region PRMD extraction. Exclude from primary site/laterality prevalence meta-analysis because body regions are broad composites, laterality n/N is absent, recall period is unclear, location missingness differs by sex, and overall 88% prevalence is not fully reconcilable with sex-specific estimates. Check possible overlap with Brusky 2009.",
  "If a study reports only overall pain while playing, pain after playing, performance interruption scores, or number of marked pain sites, but no anatomical site-specific and laterality-specific n/N, classify it as narrative/support or supplementary overall-pain evidence rather than primary site/laterality prevalence.",
  "Do not merge distinct overall pain outcomes. Pain while playing and at least one marked pain site are different outcomes and must not be treated as interchangeable PRMD prevalence values.",
  "A 0-10 VAS, never-always scale, or percent of performance affected is a continuous/frequency/severity measure unless the article defines a binary case threshold. Do not create pain_n from VAS means or frequency scores.",
  "Risk-factor correlation or regression findings in small cross-sectional convenience samples should be retained as exploratory narrative risk-factor evidence, not causal conclusions.",
  "Yoshimura et al. 2006 calibration: Risk Factors for Piano-related Pain among College Students should be excluded from primary anatomical-region/laterality prevalence meta-analysis. It may be retained for narrative risk-factor synthesis and limited supplementary overall piano-related pain: reconstructed 30/35 pain while playing from 86%, and 32/35 at least one pain site marked. Keep these as separate outcomes, recall period not reported, strict interference-based PRMD no, and do not infer site/laterality counts.",
  "If the official analyzed sample size conflicts with pain figures, cluster/confusion matrices, or logistic-regression denominators, do not choose a convenient n/N. Mark overall pain numerator/denominator as NR or internally inconsistent until the source can be reconciled.",
  "If pain/no-pain category direction is contradictory across figures, text, or model tables, do not use the article for overall pain-prevalence pooling, even when a figure appears to show a binary split.",
  "Do not pool risk-factor odds ratios from small cross-sectional models when confidence intervals, standard errors, exact p values, or stable model definitions are absent. Keep those ORs as narrative-only risk-factor evidence.",
  "Santos et al. 2024 calibration: Odds ratio of occurrence of pain, postural changes, and disabilities of violinists should be excluded from primary anatomical-region/laterality prevalence meta-analysis and from overall pain-prevalence pooling. The official sample size is 38 but pain figures/model outputs use 39 observations, pain/no-pain allocation is contradictory, recall period and playing-related case definition are unclear, site/laterality n/N is absent, VAS/DASH are not extractable for pooling, and reported posture/practice ORs lack confidence intervals. Retain only limited narrative risk-factor evidence.",
  "Narrative/support inclusion is appropriate when the article is topically relevant but quantitative n/total or effect-size extraction is incomplete, when numeric data exist but the outcome/grouping/timeframe is incompatible with the primary region/laterality meta-analysis, when only continuous symptom/disability scores are available, when only supplementary graph-reconstructed broad-region data are available, or when only overall pain/risk-factor evidence is available.",
  "Exclusion can be accepted only when confidence>=80 and at least one fixed exclusion reason is clearly supported by the full text.",
  "Use uncertain/human verification when confidence<70, score<65, grade is low/unsafe, model drafts disagree, critical fields are missing, or numeric source evidence is absent.",
];

const stringSchema = { type: "string" } as const;
const nullableStringSchema = { type: ["string", "null"] } as const;
const booleanOrNullSchema = { type: ["boolean", "null"] } as const;
const stringArraySchema = { type: "array", items: stringSchema } as const;

const reviewerChecksResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "originalObservationalData",
    "instrumentOrGroupSpecificData",
    "regionSpecificPainOutcome",
    "extractableNumeratorDenominator",
    "treatmentOrInterventionStudy",
    "nonEnglishFullText",
  ],
  properties: {
    originalObservationalData: booleanOrNullSchema,
    instrumentOrGroupSpecificData: booleanOrNullSchema,
    regionSpecificPainOutcome: booleanOrNullSchema,
    extractableNumeratorDenominator: booleanOrNullSchema,
    treatmentOrInterventionStudy: booleanOrNullSchema,
    nonEnglishFullText: booleanOrNullSchema,
  },
} as const;

const fieldEvidenceResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rowIndex", "field", "value", "evidence", "sourceHint", "needsReview"],
  properties: {
    rowIndex: { type: "number" },
    field: stringSchema,
    value: stringSchema,
    evidence: stringSchema,
    sourceHint: nullableStringSchema,
    needsReview: { type: "boolean" },
  },
} as const;

const textEvidenceResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "excerpt"],
  properties: {
    label: stringSchema,
    excerpt: stringSchema,
  },
} as const;

const reviewCriterionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "status", "comment"],
  properties: {
    score: { type: "number" },
    status: stringSchema,
    comment: stringSchema,
  },
} as const;

function metaReviewCriteriaResponseSchema() {
  const keys = Object.keys(metaReviewEvaluationCriteria);
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((key) => [key, reviewCriterionResponseSchema])),
  } as const;
}

export function createMetaFullTextResponseFormat(extractionColumns: string[]) {
  const rowColumns = extractionColumns.length > 0 ? extractionColumns : defaultCriticalFields;
  const rowProperties = Object.fromEntries(rowColumns.map((column) => [column, stringSchema]));

  return {
    type: "json_schema",
    name: "meta_full_text_analysis",
    description: "Full-text screening, extraction, and quality review for a meta-analysis article.",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["titleGuess", "eligibility", "study", "extraction", "evidence", "nextActions", "reviewEvaluation"],
      properties: {
        titleGuess: nullableStringSchema,
        eligibility: {
          type: "object",
          additionalProperties: false,
          required: ["decision", "confidence", "summary", "reasons", "exclusionReasons", "reviewerChecks"],
          properties: {
            decision: {
              type: "string",
              enum: ["include_quantitative", "include_narrative_support", "exclude", "uncertain"],
            },
            confidence: { type: "number" },
            summary: stringSchema,
            reasons: stringArraySchema,
            exclusionReasons: stringArraySchema,
            reviewerChecks: reviewerChecksResponseSchema,
          },
        },
        study: {
          type: "object",
          additionalProperties: false,
          required: [
            "design",
            "country",
            "population",
            "sampleSizeTotal",
            "instruments",
            "mappedAsymmetryGroup",
            "recallWindow",
            "painDefinition",
            "prmdDefinition",
          ],
          properties: {
            design: nullableStringSchema,
            country: nullableStringSchema,
            population: nullableStringSchema,
            sampleSizeTotal: nullableStringSchema,
            instruments: stringArraySchema,
            mappedAsymmetryGroup: nullableStringSchema,
            recallWindow: nullableStringSchema,
            painDefinition: nullableStringSchema,
            prmdDefinition: nullableStringSchema,
          },
        },
        extraction: {
          type: "object",
          additionalProperties: false,
          required: ["rows", "fieldEvidence", "missingCriticalFields", "validationIssues"],
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: rowColumns,
                properties: rowProperties,
              },
            },
            fieldEvidence: { type: "array", items: fieldEvidenceResponseSchema },
            missingCriticalFields: stringArraySchema,
            validationIssues: stringArraySchema,
          },
        },
        evidence: { type: "array", items: textEvidenceResponseSchema },
        nextActions: stringArraySchema,
        reviewEvaluation: {
          type: "object",
          additionalProperties: false,
          required: ["score", "grade", "summary", "improvement", "criteria", "modelName"],
          properties: {
            score: { type: "number" },
            grade: stringSchema,
            summary: stringSchema,
            improvement: stringSchema,
            criteria: metaReviewCriteriaResponseSchema(),
            modelName: nullableStringSchema,
          },
        },
      },
    },
  } as const;
}

export async function analyzeMetaFullTextUpload(input: AnalyzeMetaFullTextInput) {
  const fileType = detectFileType(input.fileName, input.mimeType);
  const sourceFileSha256 = crypto.createHash("sha256").update(input.buffer).digest("hex");
  const extracted = await extractFullText(input.buffer, fileType);
  const text = extracted.text;
  if (!text.trim()) {
    throw new Error("full-text article에서 분석 가능한 텍스트를 추출하지 못했습니다. 스캔 PDF는 OCR 처리 후, Word 파일은 읽을 수 있는 .doc/.docx 또는 PDF로 다시 업로드해 주세요.");
  }

  const analysisText = normalizeText(text);
  const extractionWarnings: string[] = [];
  const openAiText = prepareOpenAiFullText(analysisText);
  if (openAiText.warning) extractionWarnings.push(openAiText.warning);
  const fallback = fallbackAnalyzeFullText({
    fileName: input.fileName,
    fileType,
    referenceRecord: input.referenceRecord ?? null,
    researcherGuidance: input.researcherGuidance ?? null,
    text,
    analysisText,
    sourceFileSha256,
    extractionColumns: input.extractionColumns,
    extractionWarnings,
  });

  const reviewerConfigResult = await resolveAiReviewerConfigsForFullText();
  if (!reviewerConfigResult.configs) {
    return withAiWarning(fallback, reviewerConfigResult.warning, null);
  }

  const selectedReviewerIds = normalizeReviewerIds(input.reviewerIds);
  const enabledReviewers = reviewerConfigResult.configs.filter(
    (reviewer) =>
      reviewer.apiKey &&
      reviewerProviderReady(reviewer) &&
      (selectedReviewerIds.length > 0 ? selectedReviewerIds.includes(reviewer.id) : reviewer.enabled),
  );
  if (enabledReviewers.length === 0) {
    const selectedWarning = selectedReviewerIds.length
      ? `Selected AI reviewer slot(s) are not ready or do not have usable API keys: ${selectedReviewerIds.join(", ")}.`
      : null;
    return withAiWarning(
      fallback,
      selectedWarning ??
        reviewerConfigResult.warning ??
        "No enabled AI model reviewer has a usable API key. Save at least one AI reviewer key in AI settings or set OPENAI_API_KEY for reviewer 1.",
      "missing",
    );
  }

  const modelReviews: MetaFullTextModelReview[] = [];
  let primaryAi: { analysis: AiMetaFullTextAnalysis; reviewer: MetaAiReviewerConfig } | null = null;

  for (const configuredReviewer of enabledReviewers) {
    const reviewer = normalizeAiReviewerForRequest(configuredReviewer);
    const ai = await analyzeWithAiReviewer({
      fileName: input.fileName,
      fileType,
      referenceRecord: input.referenceRecord ?? null,
      text: openAiText.text,
      extractionColumns: input.extractionColumns,
      fallback,
      reviewer,
      researcherGuidance: input.researcherGuidance ?? null,
    });
    modelReviews.push(createModelReviewSummary(reviewer, ai.analysis, ai.warning, fallback, ai.promptMetadata));
    if (ai.analysis && !primaryAi) primaryAi = { analysis: ai.analysis, reviewer };
  }

  if (!primaryAi) {
    const warnings = modelReviews.map((item) => item.warning).filter(Boolean).join(" | ");
    return withAiWarning(
      {
        ...fallback,
        researcherGuidance: normalizeMetaFullTextResearcherGuidance(input.researcherGuidance),
        modelReviews,
      },
      warnings || "AI model reviewers did not return a valid structured result, so fallback rules were used.",
      "missing",
    );
  }

  const aiInstruments = normalizeList(primaryAi.analysis.study?.instruments);
  const normalized = normalizeAnalysis({
    ...fallback,
    ...primaryAi.analysis,
    eligibility: {
      ...fallback.eligibility,
      ...primaryAi.analysis.eligibility,
      reviewerChecks: {
        ...fallback.eligibility.reviewerChecks,
        ...primaryAi.analysis.eligibility?.reviewerChecks,
      },
    },
    study: {
      ...fallback.study,
      ...primaryAi.analysis.study,
      instruments: (aiInstruments.length > 0 ? aiInstruments : fallback.study.instruments).slice(0, 16),
    },
    extraction: normalizeExtraction(primaryAi.analysis.extraction, fallback.extraction, input.extractionColumns),
    evidence: normalizeEvidence([...(primaryAi.analysis.evidence ?? []), ...fallback.evidence]).slice(0, 10),
    nextActions: normalizeList([...(primaryAi.analysis.nextActions ?? []), ...fallback.nextActions]).slice(0, 8),
    reviewEvaluation: normalizeReviewEvaluation(
      primaryAi.analysis.reviewEvaluation,
      fallback.reviewEvaluation,
      primaryAi.reviewer.modelName,
    ),
    aiUsed: true,
    model: primaryAi.reviewer.modelName,
    aiConfigSource: primaryAi.reviewer.apiKeySource,
    aiWarning: null,
    promptMetadata:
      modelReviews.find((review) => review.reviewerId === primaryAi.reviewer.id)?.promptMetadata ?? fallback.promptMetadata,
    researcherGuidance: normalizeMetaFullTextResearcherGuidance(input.researcherGuidance),
    modelReviews,
  });
  return {
    ...normalized,
    extraction: {
      ...normalized.extraction,
      validationIssues: normalizeList([...normalized.extraction.validationIssues, ...extractionWarnings]),
    },
  };
}

async function resolveAiReviewerConfigsForFullText() {
  try {
    return {
      configs: await resolveMetaAiReviewerConfigs(),
      warning: null,
    };
  } catch (error) {
    return {
      configs: null,
      warning: `AI reviewer settings could not be read, so fallback rules were used. Details: ${formatAiSettingsError(error)}`,
    };
  }
}

function withAiWarning(
  analysis: MetaFullTextAnalysis,
  warning: string | null,
  source: MetaFullTextAnalysis["aiConfigSource"],
) {
  return normalizeAnalysis({
    ...analysis,
    aiUsed: false,
    model: null,
    aiConfigSource: source,
    aiWarning: warning,
    extraction: {
      ...analysis.extraction,
      validationIssues: normalizeList([
        ...analysis.extraction.validationIssues,
        warning ? `AI warning: ${warning}` : "",
      ]),
    },
    nextActions: normalizeList([
      warning ? "Fix the AI settings warning, then rerun full-text analysis before final include/exclude or extraction." : "",
      ...analysis.nextActions,
    ]).slice(0, 8),
  });
}

function formatAiSettingsError(error: unknown) {
  const details = metaAiSettingsErrorDetails(error) as Record<string, unknown>;
  const parts = [
    details.operation ? `operation=${details.operation}` : "",
    details.path ? `path=${details.path}` : "",
    details.backend ? `backend=${details.backend}` : "",
    details.code ? `code=${details.code}` : "",
    details.message ? `message=${details.message}` : "",
    details.help ? `help=${details.help}` : "",
  ].filter(Boolean);

  if (parts.length > 0) return parts.join("; ");
  return error instanceof Error ? error.message : String(error);
}

function normalizeReviewerIds(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.replace(/[^a-zA-Z0-9_-]/g, "").trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 3);
}

function reviewerProviderReady(reviewer: MetaAiReviewerConfig) {
  return reviewer.providerType === "OPENAI" || Boolean(reviewer.baseUrl) || looksLikeOpenAiModel(reviewer.modelName);
}

function normalizeAiReviewerForRequest(reviewer: MetaAiReviewerConfig): MetaAiReviewerConfig {
  if (
    reviewer.providerType === "OPENAI_COMPATIBLE" &&
    !reviewer.baseUrl &&
    looksLikeOpenAiModel(reviewer.modelName)
  ) {
    return {
      ...reviewer,
      providerType: "OPENAI",
      baseUrl: null,
    };
  }

  if (
    reviewer.providerType === "OPENAI_COMPATIBLE" &&
    isGoogleGeminiOpenAiBaseUrl(reviewer.baseUrl) &&
    isLegacyGeminiReviewerModel(reviewer.modelName)
  ) {
    return {
      ...reviewer,
      modelName: recommendedGeminiReviewerModelName,
    };
  }
  return reviewer;
}

function isLegacyGeminiReviewerModel(modelName: string) {
  const normalized = modelName.trim().toLowerCase();
  return normalized === "gemini-3.5" || normalized === "gemini-3.5-flash";
}

function isGoogleGeminiOpenAiBaseUrl(baseUrl: string | null | undefined) {
  return /generativelanguage\.googleapis\.com\/v1beta\/openai\/?$/i.test(baseUrl?.trim() ?? "");
}

function looksLikeOpenAiModel(modelName: string) {
  return /^(gpt-|o\d|o-|chatgpt-|ft:)/i.test(modelName.trim());
}

function detectFileType(fileName: string, mimeType = ""): MetaFullTextFileType {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) return "pdf";
  if (
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    lowerMime.includes("msword") ||
    lowerMime.includes("wordprocessingml")
  ) {
    return "word";
  }
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerMime.startsWith("text/")) return "text";
  throw new Error("full-text 분석은 PDF, Word(.doc/.docx), TXT 파일을 지원합니다.");
}

async function extractFullText(buffer: Buffer, fileType: MetaFullTextFileType) {
  if (fileType === "pdf") return extractPdfText(buffer);
  if (fileType === "word") return extractWordTextWithWordExtractor(buffer);
  return { text: buffer.toString("utf8"), totalPages: null };
}

async function extractPdfText(buffer: Buffer) {
  return extractPdfTextWithPdfParse(buffer);
}

function fallbackAnalyzeFullText({
  fileName,
  fileType,
  referenceRecord,
  researcherGuidance,
  text,
  analysisText,
  sourceFileSha256,
  extractionColumns,
  extractionWarnings,
}: {
  fileName: string;
  fileType: MetaFullTextFileType;
  referenceRecord: string | null;
  researcherGuidance: string | null;
  text: string;
  analysisText: string;
  sourceFileSha256: string;
  extractionColumns: string[];
  extractionWarnings: string[];
}): MetaFullTextAnalysis {
  const lower = analysisText.toLowerCase();
  const instruments = instrumentTerms.filter((term) => lower.includes(term));
  const regions = regionTerms.filter((term) => lower.includes(term));
  const observational = /cross[-\s]?sectional|survey|questionnaire|prevalence|cohort|case[-\s]?control|observational/i.test(
    analysisText,
  );
  const treatment = /randomi[sz]ed|intervention|treatment|rehabilitation|exercise|splint|surgery|botulinum|therapy/i.test(
    analysisText,
  );
  const denominatorSignal = /\b(n|total|participants|respondents|sample)\s*[=:]?\s*\d{2,5}\b/i.test(analysisText);
  const regionSignal = regions.length > 0 && /pain|prmd|musculoskeletal|playing[-\s]?related/i.test(analysisText);
  const decision: MetaFullTextDecision = "uncertain";
  const row = emptyExtractionRow(extractionColumns);
  row.study_id = slugFromFileName(fileName);
  row.specific_instrument = instruments.join("; ");
  row.mapping_confidence = "unclear";
  row.source_pdf_available = "yes";
  row.coder = "AI fallback rules";
  row.conflict_status = "needs human verification";
  row.notes_on_extractability =
    "OpenAI API 미사용 fallback 결과입니다. include/exclude 또는 n/total을 확정하지 않으며, 원문 table/figure/supplement에서 연구자가 직접 확인해야 합니다.";

  return normalizeAnalysis({
    fileName,
    fileType,
    extractedTextLength: text.length,
    truncated: extractionWarnings.length > 0,
    analysisSchemaVersion: metaFullTextAnalysisSchemaVersion,
    sourceFileSha256,
    promptMetadata: fallbackPromptMetadata(researcherGuidance, extractionColumns),
    analyzedAt: new Date().toISOString(),
    aiUsed: false,
    model: null,
    aiConfigSource: null,
    aiWarning: null,
    referenceRecord,
    researcherGuidance: normalizeMetaFullTextResearcherGuidance(researcherGuidance),
    titleGuess: guessTitle(analysisText, referenceRecord),
    eligibility: {
      decision,
      confidence: 20,
      summary: "OpenAI API 키가 없어 PDF 텍스트 신호만 표시했습니다. fallback은 포함/제외를 확정하지 않으며 연구자가 원문을 확인해야 합니다.",
      reasons: [
        observational ? "observational/prevalence/survey 신호가 있습니다." : "observational study 신호가 명확하지 않습니다.",
        instruments.length > 0 ? `악기 신호: ${instruments.join(", ")}` : "악기 또는 악기군 신호가 약합니다.",
        regionSignal ? `부위/통증 신호: ${regions.slice(0, 8).join(", ")}` : "region-specific pain outcome 신호가 약합니다.",
        denominatorSignal ? "denominator/sample size 신호가 있습니다." : "n/total 추출 가능 여부는 확인 필요합니다.",
      ],
      exclusionReasons: treatment ? ["treatment/intervention/RCT 가능성이 있어 primary analysis 제외 여부 확인 필요"] : [],
      reviewerChecks: {
        originalObservationalData: observational || null,
        instrumentOrGroupSpecificData: instruments.length > 0 || null,
        regionSpecificPainOutcome: regionSignal || null,
        extractableNumeratorDenominator: denominatorSignal || null,
        treatmentOrInterventionStudy: treatment || null,
        nonEnglishFullText: null,
      },
    },
    study: {
      design: observational ? "observational/survey signal detected" : null,
      country: null,
      population: excerptAroundPattern(analysisText, /musician|instrumentalist|orchestra|student|professional/gi),
      sampleSizeTotal: firstMatch(analysisText, /\b(?:n|N|sample|participants|respondents)\s*[=:]?\s*(\d{2,5})\b/),
      instruments,
      mappedAsymmetryGroup: null,
      recallWindow: excerptAroundPattern(analysisText, /past\s+\d+\s+(?:days|weeks|months|years)|last\s+\d+\s+(?:days|weeks|months|years)|lifetime|current|12\s*months?/gi),
      painDefinition: excerptAroundPattern(analysisText, /pain|PRMD|playing[-\s]?related|musculoskeletal/gi),
      prmdDefinition: excerptAroundPattern(analysisText, /playing[-\s]?related musculoskeletal|PRMD/gi),
    },
    extraction: {
      columns: extractionColumns,
      rows: [row],
      fieldEvidence: [],
      missingCriticalFields: missingCriticalFields(row),
      validationIssues: [
        ...validateExtractionRows([row]),
        ...extractionWarnings,
        "fallback rules는 cell-level evidence와 정량 n/total을 확정하지 않습니다.",
      ],
    },
    evidence: [
      ...evidenceFor(analysisText, "Population", /musician|instrumentalist|orchestra|student|professional/gi),
      ...evidenceFor(analysisText, "Pain outcome", /pain|PRMD|musculoskeletal|playing[-\s]?related/gi),
      ...evidenceFor(analysisText, "Denominator", /\b(n|total|participants|respondents|sample)\s*[=:]?\s*\d{2,5}\b/gi),
    ].slice(0, 8),
    nextActions: [
      "원문 table/figure/supplement에서 악기군별 denominator와 부위별 n/total을 확인하세요.",
      "treatment/intervention/RCT 신호가 있으면 primary prevalence analysis에서 제외하세요.",
      "스캔 PDF 또는 표 구조가 무너진 PDF는 OCR/table extraction 후 다시 분석하세요.",
      "AI 결과는 최종판정이 아니라 reviewer verification 초안으로만 사용하세요.",
    ],
    modelReviews: [],
    reviewEvaluation: {
      score: 25,
      grade: "fallback-human-verification-required",
      summary:
        "OpenAI analysis was not available, so this full-text judgment is a low-confidence rule-based draft. The reviewer must verify inclusion/exclusion and every denominator/numerator value against the source article.",
      improvement:
        "Configure OPENAI_API_KEY, rerun the article, and manually check the article tables, figures, and supplements for denominator, numerator, instrument group, region, and laterality data.",
      criteria: {
        eligibility_fit: reviewCriterion(20, "uncertain", "Rule-based signals cannot confirm protocol eligibility from the full text."),
        extraction_completeness: reviewCriterion(15, "insufficient", "Fallback mode cannot reliably extract study parameters from article tables."),
        evidence_traceability: reviewCriterion(25, "limited", "Only short text snippets are available; page or table hints are not guaranteed."),
        quantitative_integrity: reviewCriterion(20, "needs_manual_check", "n/total consistency cannot be trusted until source tables are checked."),
        reviewer_actionability: reviewCriterion(45, "partial", "Next reviewer checks are listed, but the draft is not enough for final coding."),
        risk_visibility: reviewCriterion(55, "visible", "OpenAI absence and OCR/table limitations are explicitly surfaced."),
      },
      modelName: null,
    },
  });
}

async function analyzeWithAiReviewer({
  fileName,
  fileType,
  referenceRecord,
  text,
  extractionColumns,
  fallback,
  reviewer,
  researcherGuidance,
}: {
  fileName: string;
  fileType: MetaFullTextFileType;
  referenceRecord: string | null;
  text: string;
  extractionColumns: string[];
  fallback: MetaFullTextAnalysis;
  reviewer: MetaAiReviewerConfig;
  researcherGuidance: string | null;
}): Promise<{ analysis: AiMetaFullTextAnalysis | null; warning: string | null; promptMetadata: MetaFullTextPromptMetadata }> {
  const openai = new OpenAI({
    apiKey: reviewer.apiKey,
    baseURL: reviewer.baseUrl ?? undefined,
    maxRetries: 0,
    timeout: 45_000,
  });
  try {
    const guidance = normalizeMetaFullTextResearcherGuidance(researcherGuidance);
    const prompt = `You are a meticulous systematic-review and meta-analysis extraction assistant.

Task:
Analyze the uploaded full-text article for a systematic review/meta-analysis on instrument-imposed postural asymmetry and region/laterality-specific playing-related musculoskeletal pain (PRMD) in instrumental musicians.

Important rules:
${guidance}

Review evaluation criteria:
${JSON.stringify(metaReviewEvaluationCriteria, null, 2)}

Scoring and selection rules:
${metaFullTextScoringRules.map((rule) => `- ${rule}`).join("\n")}

Return this JSON schema:
{
  "titleGuess": "string or null",
  "eligibility": {
    "decision": "include_quantitative|include_narrative_support|exclude|uncertain",
    "confidence": 0,
    "summary": "Korean 2-3 sentence summary",
    "reasons": ["Korean reason"],
    "exclusionReasons": ["fixed exclusion reason if any"],
    "reviewerChecks": {
      "originalObservationalData": true,
      "instrumentOrGroupSpecificData": true,
      "regionSpecificPainOutcome": true,
      "extractableNumeratorDenominator": true,
      "treatmentOrInterventionStudy": false,
      "nonEnglishFullText": false
    }
  },
  "study": {
    "design": "string or null",
    "country": "string or null",
    "population": "string or null",
    "sampleSizeTotal": "string or null",
    "instruments": ["instrument or group"],
    "mappedAsymmetryGroup": "High postural asymmetry|Moderate postural asymmetry / seated axial-load|Low/mixed postural asymmetry or orofacial-load modifier|Mixed/unclear|null",
    "recallWindow": "string or null",
    "painDefinition": "string or null",
    "prmdDefinition": "string or null"
  },
  "extraction": {
    "rows": [
      {
        "study_id": "short id",
        "first_author": "string",
        "year": "string",
        "country": "string",
        "design": "string",
        "sample_size_total": "string",
        "sample_size_analyzed": "string",
        "population_source": "string",
        "professional_status": "string",
        "mean_age": "string",
        "female_percent": "string",
        "instrument_group_reported": "string",
        "specific_instrument": "string",
        "mapped_asymmetry_group": "string",
        "mapping_confidence": "high|medium|low|unclear",
        "playing_hours": "string",
        "years_experience": "string",
        "recall_window": "string",
        "pain_definition": "string",
        "prmd_definition": "string",
        "neck_n": "string",
        "neck_total": "string",
        "left_shoulder_n": "string",
        "left_shoulder_total": "string",
        "right_shoulder_n": "string",
        "right_shoulder_total": "string",
        "shoulder_unspecified_n": "string",
        "shoulder_unspecified_total": "string",
        "left_elbow_n": "string",
        "left_elbow_total": "string",
        "right_elbow_n": "string",
        "right_elbow_total": "string",
        "elbow_unspecified_n": "string",
        "elbow_unspecified_total": "string",
        "left_wrist_hand_n": "string",
        "left_wrist_hand_total": "string",
        "right_wrist_hand_n": "string",
        "right_wrist_hand_total": "string",
        "wrist_hand_unspecified_n": "string",
        "wrist_hand_unspecified_total": "string",
        "upper_back_n": "string",
        "upper_back_total": "string",
        "lower_back_n": "string",
        "lower_back_total": "string",
        "tmj_jaw_n": "string",
        "tmj_jaw_total": "string",
        "headache_n": "string",
        "headache_total": "string",
        "pain_intensity_mean": "string",
        "pain_intensity_sd": "string",
        "pain_interference_mean": "string",
        "pain_interference_sd": "string",
        "performance_limitation_n": "string",
        "performance_limitation_total": "string",
        "adjusted_or": "string",
        "adjustment_covariates": "string",
        "notes_on_extractability": "string",
        "source_pdf_available": "yes",
        "coder": "AI draft",
        "second_reviewer": "",
        "conflict_status": "needs human verification",
        "risk_of_bias_tool": "JBI Critical Appraisal Checklist for Studies Reporting Prevalence Data",
        "rob_selection_recruitment": "Q1-Q3 and Q9 summary: low|moderate|high|unclear with brief reason",
        "rob_measurement_outcome": "Q6-Q7 summary: low|moderate|high|unclear with brief reason",
        "rob_confounding_adjustment": "not primary for prevalence; use JBI analytical cross-sectional only for secondary risk-factor evidence",
        "rob_missing_data": "Q5 and Q9 summary",
        "rob_selective_reporting": "Q8 plus denominator/outcome reporting consistency",
        "rob_overall_judgement": "low|moderate|high|unclear",
        "rob_jbi_tool_version": "JBI prevalence checklist 2020-08 PDF or article-reported version",
        "rob_jbi_q1_sample_frame": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q2_sampling": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q3_sample_size": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q4_subjects_setting": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q5_sample_coverage": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q6_condition_identification": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q7_standard_measurement": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q8_statistical_analysis": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_q9_response_rate": "yes|no|unclear|not applicable - brief source-based reason",
        "rob_jbi_yes_count": "0-9",
        "rob_jbi_no_unclear_count": "0-9",
        "rob_jbi_overall_risk": "low|moderate|high|unclear",
        "rob_jbi_notes": "short source-based RoB notes, especially Q6/Q7 downgrades",
        "rob_supporting_quote": "short exact source excerpt for the most important RoB judgement",
        "rob_page_table": "page/table/figure/supplement hint"
      }
    ],
    "fieldEvidence": [
      {
        "rowIndex": 0,
        "field": "neck_n",
        "value": "string",
        "evidence": "short exact excerpt supporting this exact cell",
        "sourceHint": "page/table/figure/supplement hint or null",
        "needsReview": true
      }
    ],
    "missingCriticalFields": ["field"],
    "validationIssues": ["issue"]
  },
  "evidence": [{"label":"string","excerpt":"short exact excerpt"}],
  "nextActions": ["Korean next action"],
  "reviewEvaluation": {
    "score": 0,
    "grade": "high|moderate|low|unsafe",
    "summary": "Korean 1-2 sentence quality assessment",
    "improvement": "Korean concrete instruction for the human reviewer",
    "criteria": {
      "eligibility_fit": {"score": 0, "status": "pass|partial|fail|unclear", "comment": "Korean comment"},
      "extraction_completeness": {"score": 0, "status": "pass|partial|fail|unclear", "comment": "Korean comment"},
      "evidence_traceability": {"score": 0, "status": "pass|partial|fail|unclear", "comment": "Korean comment"},
      "quantitative_integrity": {"score": 0, "status": "pass|partial|fail|unclear", "comment": "Korean comment"},
      "reviewer_actionability": {"score": 0, "status": "pass|partial|fail|unclear", "comment": "Korean comment"},
      "risk_visibility": {"score": 0, "status": "pass|partial|fail|unclear", "comment": "Korean comment"}
    },
    "modelName": "${reviewer.modelName}"
  }
}

Extraction columns that must be present in every row:
${JSON.stringify(extractionColumns)}

Reference screening row copied from Excel, if supplied:
${referenceRecord || "none"}

Fallback signals:
${JSON.stringify(
  {
    decision: fallback.eligibility.decision,
    reasons: fallback.eligibility.reasons,
    instruments: fallback.study.instruments,
  },
  null,
  2,
)}

File: ${fileName}
File type: ${fileType}

Full-text:
${text}`;

    const metadata = promptMetadata(prompt, guidance, extractionColumns);
    const outputText =
      reviewer.providerType === "OPENAI"
        ? await analyzeWithOpenAiResponses(openai, reviewer.modelName, extractionColumns, prompt)
        : await analyzeWithOpenAiCompatibleChat(openai, reviewer.modelName, prompt);

    if (!outputText.trim()) throw new Error("OpenAI returned an empty full-text analysis response.");
    const parsed = JSON.parse(extractJson(outputText)) as unknown;
    const normalizedParsed = coerceAiMetaFullTextAnalysisCandidate(parsed);
    const validated = aiMetaFullTextAnalysisSchema.safeParse(normalizedParsed);
    if (!validated.success) {
      const flattened = validated.error.flatten();
      console.error("Meta full-text OpenAI analysis schema validation failed.", {
        reviewerId: reviewer.id,
        label: reviewer.label,
        providerType: reviewer.providerType,
        modelName: reviewer.modelName,
        fieldErrors: flattened.fieldErrors,
        formErrors: flattened.formErrors,
      });
      return {
        analysis: null,
        promptMetadata: metadata,
        warning:
          `Structured AI response did not match the meta-analysis schema after compatibility normalization. Details: ${summarizeSchemaErrors(flattened.fieldErrors)}`,
      };
    }
    return { analysis: validated.data as AiMetaFullTextAnalysis, warning: null, promptMetadata: metadata };
  } catch (error) {
    console.error("Meta full-text AI reviewer analysis failed; using fallback.", {
      reviewerId: reviewer.id,
      label: reviewer.label,
      providerType: reviewer.providerType,
      modelName: reviewer.modelName,
      error,
    });
    return {
      analysis: null,
      promptMetadata: fallbackPromptMetadata(researcherGuidance, extractionColumns),
      warning: `${reviewer.label} (${reviewer.modelName}) request failed. Details: ${formatAiReviewerRequestError(error, reviewer)}`,
    };
  }
}

async function analyzeWithOpenAiResponses(
  openai: OpenAI,
  modelName: string,
  extractionColumns: string[],
  prompt: string,
) {
  const response = await openai.responses.create({
    model: modelName,
    text: {
      format: createMetaFullTextResponseFormat(extractionColumns),
    },
    input: prompt,
  });
  return extractOpenAiOutputText(response);
}

async function analyzeWithOpenAiCompatibleChat(openai: OpenAI, modelName: string, prompt: string) {
  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  return response.choices[0]?.message?.content ?? "";
}

function createModelReviewSummary(
  reviewer: MetaAiReviewerConfig,
  analysis: AiMetaFullTextAnalysis | null,
  warning: string | null,
  fallback: MetaFullTextAnalysis,
  metadata: MetaFullTextPromptMetadata = fallback.promptMetadata,
): MetaFullTextModelReview {
  const eligibility = {
    ...fallback.eligibility,
    ...analysis?.eligibility,
  };
  const extraction = normalizeExtraction(analysis?.extraction, fallback.extraction, fallback.extraction.columns);
  const reviewEvaluation = normalizeReviewEvaluation(
    analysis?.reviewEvaluation,
    fallback.reviewEvaluation,
    reviewer.modelName,
  );
  return {
    reviewerId: reviewer.id,
    label: reviewer.label,
    providerType: reviewer.providerType,
    modelName: reviewer.modelName,
    baseUrl: reviewer.baseUrl,
    analysisSchemaVersion: fallback.analysisSchemaVersion,
    promptMetadata: metadata,
    analyzedAt: new Date().toISOString(),
    sourceFileSha256: fallback.sourceFileSha256,
    inputTextLength: fallback.extractedTextLength,
    truncated: fallback.truncated,
    aiUsed: Boolean(analysis),
    decision: analysis?.eligibility?.decision ?? "uncertain",
    confidence: clamp(coerceConfidenceScore(eligibility.confidence) ?? 0, 0, 100),
    summary: eligibility.summary || warning || "No structured result returned.",
    reasons: normalizeList(eligibility.reasons).slice(0, 8),
    exclusionReasons: normalizeList(eligibility.exclusionReasons).slice(0, 8),
    reviewerChecks: eligibility.reviewerChecks,
    reviewScore: reviewEvaluation.score,
    reviewGrade: reviewEvaluation.grade,
    extractionRowCount: extraction.rows.length,
    missingCriticalFieldCount: extraction.missingCriticalFields.length,
    validationIssueCount: extraction.validationIssues.length,
    extractionRows: extraction.rows,
    fieldEvidence: extraction.fieldEvidence,
    missingCriticalFields: extraction.missingCriticalFields,
    validationIssues: extraction.validationIssues,
    warning,
  };
}

function formatOpenAIError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 800);
}

function formatAiReviewerRequestError(error: unknown, reviewer: MetaAiReviewerConfig) {
  const message = formatOpenAIError(error);
  const hints: string[] = [];
  const baseUrl = reviewer.baseUrl?.trim() ?? "";
  const looksLikeNotFound = /\b404\b|not\s+found/i.test(message);
  const looksLikeRateOrTimeout = /\b429\b|rate\s*limit|quota|timed?\s*out|timeout/i.test(message);
  const looksLikeDeepSeek =
    /deepseek/i.test(baseUrl) || /deepseek/i.test(reviewer.modelName) || /deepseek/i.test(message);

  if (
    reviewer.providerType === "OPENAI_COMPATIBLE" &&
    looksLikeDeepSeek &&
    /(supported API model names|deepseek-v4)/i.test(message)
  ) {
    hints.push(
      "DeepSeek rejected the model id. Use the exact lowercase model id deepseek-v4-flash or deepseek-v4-pro; DeepSeekV4Flash is not accepted.",
    );
  }

  if (reviewer.providerType === "OPENAI_COMPATIBLE" && looksLikeNotFound) {
    if (isGoogleGeminiOpenAiBaseUrl(baseUrl)) {
      hints.push(
        `Google Gemini OpenAI-compatible endpoint returned 404. This usually means the model id is not found for that endpoint or account. Check AI settings: use the Google OpenAI-compatible Base URL and an exact supported Gemini model id such as ${recommendedGeminiReviewerModelName}.`,
      );
    } else {
      hints.push(
        "The OpenAI-compatible provider returned 404. Check the Base URL and exact model id saved for this reviewer.",
      );
    }
  }

  if (looksLikeNotFound && looksLikeOpenAiModel(reviewer.modelName)) {
    hints.push(
      "This looks like an OpenAI model id. If the request still returns 404 after using the OpenAI Responses route, check the exact model id and whether this API key has access to that model.",
    );
  }

  if (
    reviewer.providerType === "OPENAI_COMPATIBLE" &&
    isGoogleGeminiOpenAiBaseUrl(baseUrl) &&
    looksLikeRateOrTimeout
  ) {
    hints.push(
      `Gemini reviewer rate limit/timeout detected. For high-volume full-text screening, use ${recommendedGeminiReviewerModelName}; it is the value Gemini reviewer configured by Wiregene Meta.`,
    );
  }

  if (reviewer.providerType === "OPENAI_COMPATIBLE" && !baseUrl && !looksLikeOpenAiModel(reviewer.modelName)) {
    hints.push("This OpenAI-compatible reviewer has no Base URL, so the saved provider settings are incomplete.");
  }

  return [message, ...hints].filter(Boolean).join(" ");
}

function normalizeAnalysis(analysis: MetaFullTextAnalysis): MetaFullTextAnalysis {
  const extraction = normalizeExtraction(analysis.extraction, analysis.extraction, analysis.extraction.columns);
  const safety = applyEligibilitySafety(
    {
      ...analysis.eligibility,
      confidence: clamp(coerceConfidenceScore(analysis.eligibility.confidence) ?? 0, 0, 100),
      reasons: normalizeList(analysis.eligibility.reasons),
      exclusionReasons: normalizeList(analysis.eligibility.exclusionReasons),
    },
    extraction,
  );
  return {
    ...analysis,
    analysisSchemaVersion: analysis.analysisSchemaVersion || metaFullTextAnalysisSchemaVersion,
    sourceFileSha256: analysis.sourceFileSha256 || "",
    promptMetadata: normalizePromptMetadata(
      analysis.promptMetadata,
      fallbackPromptMetadata(analysis.researcherGuidance, analysis.extraction.columns),
    ),
    eligibility: safety.eligibility,
    study: {
      ...analysis.study,
      instruments: normalizeList(analysis.study.instruments),
    },
    extraction: {
      ...extraction,
      validationIssues: normalizeList([...extraction.validationIssues, ...safety.validationIssues]),
    },
    evidence: normalizeEvidence(analysis.evidence),
    nextActions: normalizeList(analysis.nextActions),
    modelReviews: Array.isArray(analysis.modelReviews)
      ? analysis.modelReviews.map(normalizeModelReview)
      : [],
    reviewEvaluation: normalizeReviewEvaluation(
      analysis.reviewEvaluation,
      defaultReviewEvaluation(analysis.model),
      analysis.reviewEvaluation.modelName ?? analysis.model,
    ),
  };
}

const allowedMetaFullTextDecisions: MetaFullTextDecision[] = [
  "include_quantitative",
  "include_narrative_support",
  "exclude",
  "uncertain",
];

function normalizePromptMetadata(
  value: MetaFullTextPromptMetadata | undefined,
  fallback: MetaFullTextPromptMetadata,
): MetaFullTextPromptMetadata {
  const source = (value && typeof value === "object" ? value : {}) as Partial<MetaFullTextPromptMetadata>;
  return {
    protocolVersion: conciseReviewText(source.protocolVersion || fallback.protocolVersion || musicianPrmdProtocolVersion, 120),
    promptVersion: conciseReviewText(source.promptVersion || fallback.promptVersion || metaFullTextPromptVersion, 120),
    promptSha256: conciseReviewText(source.promptSha256 || fallback.promptSha256 || "", 80),
    researcherGuidanceSha256: conciseReviewText(
      source.researcherGuidanceSha256 || fallback.researcherGuidanceSha256 || "",
      80,
    ),
    extractionSchemaSha256: conciseReviewText(source.extractionSchemaSha256 || fallback.extractionSchemaSha256 || "", 80),
  };
}

function normalizeModelReview(review: MetaFullTextModelReview): MetaFullTextModelReview {
  const decision = allowedMetaFullTextDecisions.includes(review.decision) ? review.decision : "uncertain";
  return {
    reviewerId: String(review.reviewerId || "ai_reviewer"),
    label: String(review.label || review.modelName || "AI reviewer").replace(/\s+/g, " ").trim().slice(0, 100),
    providerType: review.providerType === "OPENAI_COMPATIBLE" ? "OPENAI_COMPATIBLE" : "OPENAI",
    modelName: String(review.modelName || "unknown-model").replace(/\s+/g, "").trim().slice(0, 120),
    baseUrl: typeof review.baseUrl === "string" && review.baseUrl.trim() ? review.baseUrl.trim() : null,
    analysisSchemaVersion: conciseReviewText(review.analysisSchemaVersion || metaFullTextAnalysisSchemaVersion, 80),
    promptMetadata: normalizePromptMetadata(review.promptMetadata, fallbackPromptMetadata("", [])),
    analyzedAt: conciseReviewText(review.analyzedAt || new Date().toISOString(), 80),
    sourceFileSha256: conciseReviewText(review.sourceFileSha256 || "", 80),
    inputTextLength: Math.max(0, Number(review.inputTextLength) || 0),
    truncated: Boolean(review.truncated),
    aiUsed: Boolean(review.aiUsed),
    decision,
    confidence: clamp(coerceConfidenceScore(review.confidence) ?? 0, 0, 100),
    summary: conciseReviewText(review.summary || "", 720),
    reasons: normalizeList(review.reasons).slice(0, 8),
    exclusionReasons: normalizeList(review.exclusionReasons).slice(0, 8),
    reviewerChecks: normalizeReviewerChecks(review.reviewerChecks),
    reviewScore: clamp(Number(review.reviewScore) || 0, 0, 100),
    reviewGrade: conciseReviewText(review.reviewGrade || "unknown", 80),
    extractionRowCount: Math.max(0, Number(review.extractionRowCount) || 0),
    missingCriticalFieldCount: Math.max(0, Number(review.missingCriticalFieldCount) || 0),
    validationIssueCount: Math.max(0, Number(review.validationIssueCount) || 0),
    extractionRows: Array.isArray(review.extractionRows)
      ? review.extractionRows.map((row) => normalizeExtractionRow(row))
      : [],
    fieldEvidence: normalizeFieldEvidence(review.fieldEvidence ?? [], review.extractionRows ?? []),
    missingCriticalFields: normalizeList(review.missingCriticalFields),
    validationIssues: normalizeList(review.validationIssues),
    warning: review.warning ? conciseReviewText(review.warning, 800) : null,
  };
}

function normalizeReviewerChecks(
  value: MetaFullTextAnalysis["eligibility"]["reviewerChecks"] | undefined,
): MetaFullTextAnalysis["eligibility"]["reviewerChecks"] {
  return {
    originalObservationalData: normalizeNullableBoolean(value?.originalObservationalData),
    instrumentOrGroupSpecificData: normalizeNullableBoolean(value?.instrumentOrGroupSpecificData),
    regionSpecificPainOutcome: normalizeNullableBoolean(value?.regionSpecificPainOutcome),
    extractableNumeratorDenominator: normalizeNullableBoolean(value?.extractableNumeratorDenominator),
    treatmentOrInterventionStudy: normalizeNullableBoolean(value?.treatmentOrInterventionStudy),
    nonEnglishFullText: normalizeNullableBoolean(value?.nonEnglishFullText),
  };
}

function normalizeNullableBoolean(value: boolean | null | undefined) {
  return typeof value === "boolean" ? value : null;
}

function normalizeExtractionRow(value: Record<string, string>) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, cell]) => [
      String(key),
      cell === null || cell === undefined ? "" : String(cell),
    ]),
  );
}

function normalizeExtraction(
  aiExtraction: AiMetaFullTextAnalysis["extraction"] | undefined,
  fallbackExtraction: MetaFullTextAnalysis["extraction"],
  extractionColumns: string[],
): MetaFullTextAnalysis["extraction"] {
  const rows = (aiExtraction?.rows?.length ? aiExtraction.rows : fallbackExtraction.rows).map((row) => {
    const normalized = emptyExtractionRow(extractionColumns);
    for (const column of extractionColumns) {
      const value = (row as Record<string, unknown>)[column];
      normalized[column] = value === null || value === undefined ? "" : String(value);
    }
    return normalized;
  });

  const validationIssues = normalizeList([
    ...(aiExtraction?.validationIssues ?? []),
    ...validateExtractionRows(rows),
  ]);

  return {
    columns: extractionColumns,
    rows,
    fieldEvidence: normalizeFieldEvidence(aiExtraction?.fieldEvidence ?? fallbackExtraction.fieldEvidence, rows),
    missingCriticalFields: normalizeList([
      ...(aiExtraction?.missingCriticalFields ?? []),
      ...rows.flatMap((row) => missingCriticalFields(row)),
    ]),
    validationIssues,
  };
}

function applyEligibilitySafety(
  eligibility: MetaFullTextAnalysis["eligibility"],
  extraction: MetaFullTextAnalysis["extraction"],
): { eligibility: MetaFullTextAnalysis["eligibility"]; validationIssues: string[] } {
  if (eligibility.decision !== "include_quantitative") return { eligibility, validationIssues: [] };

  const hasOutcomePair = extraction.rows.some((row) =>
    Object.entries(row).some(([field, value]) => {
      if (!field.endsWith("_n") || !String(value).trim()) return false;
      const total = row[`${field.slice(0, -2)}_total`];
      return Boolean(total?.trim());
    }),
  );
  const hasNumericCellEvidence = extraction.fieldEvidence.some(
    (item) => /(?:_n|_total)$/.test(item.field) && item.evidence.trim(),
  );

  if (hasOutcomePair && hasNumericCellEvidence) return { eligibility, validationIssues: [] };

  const validationIssues = [
    !hasOutcomePair
      ? "include_quantitative was downgraded because no explicit denominator-based outcome pair was extracted."
      : "",
    !hasNumericCellEvidence
      ? "include_quantitative was downgraded because extracted numeric cells do not have cell-level source evidence."
      : "",
  ].filter(Boolean);

  return {
    eligibility: {
      ...eligibility,
      decision: "uncertain",
      confidence: Math.min(eligibility.confidence, 50),
      reasons: normalizeList([
        ...eligibility.reasons,
        "Quantitative inclusion requires explicit n/total outcome pairs with cell-level source evidence; this record was downgraded for human verification.",
      ]),
      reviewerChecks: {
        ...eligibility.reviewerChecks,
        extractableNumeratorDenominator: hasOutcomePair && hasNumericCellEvidence ? true : null,
      },
    },
    validationIssues,
  };
}

function reviewCriterion(score: unknown, status: string, comment: string): MetaFullTextReviewCriterion {
  return {
    score: clamp(coerceReviewQualityScore(score) ?? 0, 0, 100),
    status: String(status || "unclear").replace(/\s+/g, " ").trim().slice(0, 60),
    comment: conciseReviewText(comment, 420),
  };
}

function defaultReviewEvaluation(modelName: string | null): MetaFullTextReviewEvaluation {
  return {
    score: 0,
    grade: "unsafe",
    summary: "No quality review was returned. Treat this result as unsafe until a human reviewer checks the article.",
    improvement: "Rerun with OpenAI enabled and verify eligibility, extraction cells, and source evidence manually.",
    criteria: Object.fromEntries(
      Object.keys(metaReviewEvaluationCriteria).map((key) => [
        key,
        reviewCriterion(0, "missing", "This quality criterion was not returned by the analysis."),
      ]),
    ),
    modelName,
  };
}

function normalizeReviewEvaluation(
  value: AiMetaFullTextReviewEvaluation | MetaFullTextReviewEvaluation | undefined,
  fallback: MetaFullTextReviewEvaluation,
  modelName: string | null,
): MetaFullTextReviewEvaluation {
  const source = (value && typeof value === "object" ? value : {}) as AiMetaFullTextReviewEvaluation;
  const fallbackCriteria = fallback.criteria ?? {};
  return {
    score: clamp(coerceReviewQualityScore(source.score ?? fallback.score ?? 0) ?? 0, 0, 100),
    grade: conciseReviewText(source.grade ?? fallback.grade ?? "unsafe", 80),
    summary: conciseReviewText(source.summary ?? fallback.summary ?? "", 520),
    improvement: conciseReviewText(source.improvement ?? fallback.improvement ?? "", 520),
    criteria: normalizeReviewCriteria(source.criteria, fallbackCriteria),
    modelName: source.modelName ?? modelName ?? fallback.modelName ?? null,
  };
}

function normalizeReviewCriteria(
  value: AiMetaFullTextReviewEvaluation["criteria"] | MetaFullTextReviewEvaluation["criteria"] | undefined,
  fallback: MetaFullTextReviewEvaluation["criteria"],
) {
  const source = (value && typeof value === "object" ? value : {}) as Record<
    string,
    Partial<MetaFullTextReviewCriterion>
  >;
  return Object.fromEntries(
    Object.keys(metaReviewEvaluationCriteria).map((key) => {
      const raw = source[key] ?? fallback[key] ?? reviewCriterion(0, "missing", "Criterion was not evaluated.");
      return [
        key,
        reviewCriterion(
          raw.score ?? 0,
          String(raw.status ?? "unclear"),
          String(raw.comment ?? metaReviewEvaluationCriteria[key as keyof typeof metaReviewEvaluationCriteria]),
        ),
      ];
    }),
  );
}

function emptyExtractionRow(columns: string[]) {
  return Object.fromEntries(columns.map((column) => [column, ""]));
}

function missingCriticalFields(row: Record<string, string>) {
  return defaultCriticalFields.filter((field) => !row[field]?.trim());
}

function validateExtractionRows(rows: Record<string, string>[]) {
  const issues: string[] = [];
  const seenRows = new Set<string>();
  rows.forEach((row, index) => {
    const rowKey = [row.study_id, row.specific_instrument, row.recall_window].map((value) => value?.trim()).join("|");
    if (rowKey.replace(/\|/g, "")) {
      if (seenRows.has(rowKey)) issues.push(`row ${index + 1}: 같은 study/instrument/recall 조합이 중복됩니다.`);
      seenRows.add(rowKey);
    }

    const sampleSize = parseStrictNumber(row.sample_size_analyzed || row.sample_size_total);
    for (const [key, value] of Object.entries(row)) {
      if (!/(?:_n|_total)$/.test(key) || !value.trim()) continue;
      if (/%/.test(value)) {
        issues.push(`row ${index + 1}: ${key}에 percent만 입력되어 있습니다. n/total 원자료 확인 필요.`);
        continue;
      }
      const numericValue = parseStrictNumber(value);
      if (numericValue === null) {
        issues.push(`row ${index + 1}: ${key} 값 "${value}"는 정수 n/total로 해석할 수 없습니다.`);
        continue;
      }
      if (numericValue < 0) issues.push(`row ${index + 1}: ${key} 값이 음수입니다.`);
      if (key.endsWith("_total") && sampleSize !== null && numericValue > sampleSize) {
        issues.push(`row ${index + 1}: ${key}(${numericValue})가 sample_size(${sampleSize})보다 큽니다.`);
      }
      if (!key.endsWith("_n")) continue;
      const totalKey = `${key.slice(0, -2)}_total`;
      if (!row[totalKey]?.trim()) {
        issues.push(`row ${index + 1}: ${key}는 있지만 ${totalKey}가 비어 있습니다.`);
        continue;
      }
      const totalValue = parseStrictNumber(row[totalKey]);
      if (totalValue !== null && numericValue > totalValue) {
        issues.push(`row ${index + 1}: ${key}(${numericValue})가 ${totalKey}(${totalValue})보다 큽니다.`);
      }
    }
    for (const [leftKey, rightKey] of [
      ["left_shoulder_total", "right_shoulder_total"],
      ["left_elbow_total", "right_elbow_total"],
      ["left_wrist_hand_total", "right_wrist_hand_total"],
    ]) {
      const left = parseStrictNumber(row[leftKey]);
      const right = parseStrictNumber(row[rightKey]);
      if (left !== null && right !== null && left !== right) {
        issues.push(`row ${index + 1}: ${leftKey}(${left})와 ${rightKey}(${right}) denominator가 다릅니다.`);
      }
    }
  });
  return issues;
}

function guessTitle(text: string, referenceRecord: string | null) {
  if (referenceRecord) {
    const segments = referenceRecord
      .split(/\t|,|\n/)
      .map((item) => item.trim())
      .filter((item) => item.length > 20);
    if (segments[0]) return segments[0].slice(0, 220);
  }
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 18 && item.length < 220);
  return line ?? null;
}

function evidenceFor(text: string, label: string, pattern: RegExp) {
  const excerpt = excerptAroundPattern(text, pattern);
  return excerpt ? [{ label, excerpt }] : [];
}

function excerptAroundPattern(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return null;
  return conciseEvidence(text.slice(Math.max(0, match.index - 180), Math.min(text.length, match.index + 360)));
}

function firstMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1] ?? match?.[0] ?? null;
}

function slugFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function normalizeText(value: string) {
  return value.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function prepareOpenAiFullText(text: string) {
  const limit = configuredOpenAiFullTextCharacterLimit();
  if (text.length <= limit) return { text, warning: null };

  const compacted = compactFullTextForOpenAi(text, limit);
  return {
    text: compacted,
    warning: `Long full text was compacted for AI review (${text.length.toLocaleString("en-US")} -> ${compacted.length.toLocaleString("en-US")} chars) to avoid server timeout or model context failure. The full extracted text is still used for rule-based fallback signals.`,
  };
}

function configuredOpenAiFullTextCharacterLimit() {
  const configured = Number(process.env.META_FULL_TEXT_OPENAI_TEXT_LIMIT ?? "");
  if (Number.isFinite(configured) && configured >= 20_000 && configured <= 180_000) return Math.floor(configured);
  return defaultOpenAiFullTextCharacterLimit;
}

function compactFullTextForOpenAi(text: string, limit: number) {
  const headLength = Math.min(24_000, Math.floor(limit * 0.4));
  const tailLength = Math.min(10_000, Math.floor(limit * 0.16));
  const keywordBudget = Math.max(0, limit - headLength - tailLength - 1_200);
  const chunks = [
    text.slice(0, headLength),
    ...keywordExcerpts(text, keywordBudget),
    text.slice(Math.max(headLength, text.length - tailLength)),
  ];
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join("\n\n[...]\n\n")
    .slice(0, limit);
}

function keywordExcerpts(text: string, budget: number) {
  if (budget <= 0) return [];
  const chunks: string[] = [];
  const used = new Set<string>();
  openAiFullTextKeywordPattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = openAiFullTextKeywordPattern.exec(text)) && chunks.join("\n").length < budget) {
    const start = Math.max(0, match.index - 1_200);
    const end = Math.min(text.length, match.index + 2_200);
    const key = `${Math.floor(start / 1_000)}-${Math.floor(end / 1_000)}`;
    if (used.has(key)) continue;
    used.add(key);
    chunks.push(text.slice(start, end));
  }

  return chunks.join("\n\n").slice(0, budget).split(/\n{2,}/).filter(Boolean);
}

function normalizeList(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((item): item is string | number | boolean => ["string", "number", "boolean"].includes(typeof item))
        .map((item) => String(item).replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeEvidence(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<MetaFullTextEvidence>;
    if (!record.label || !record.excerpt) return [];
    return [
      {
        label: String(record.label).slice(0, 80),
        excerpt: conciseEvidence(String(record.excerpt)),
      },
    ];
  });
}

function normalizeFieldEvidence(values: unknown, rows: Record<string, string>[]) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<MetaFullTextFieldEvidence>;
    const rowIndex = Number(record.rowIndex);
    const field = String(record.field ?? "").trim();
    const value = String(record.value ?? "").trim();
    const evidence = String(record.evidence ?? "").trim();
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length || !field || !evidence) return [];
    return [
      {
        rowIndex,
        field: field.slice(0, 80),
        value: value.slice(0, 120),
        evidence: conciseEvidence(evidence),
        sourceHint: record.sourceHint ? String(record.sourceHint).replace(/\s+/g, " ").trim().slice(0, 120) : null,
        needsReview: record.needsReview !== false,
      },
    ];
  });
}

function parseStrictNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.0+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function conciseEvidence(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 520 ? `${normalized.slice(0, 517)}...` : normalized;
}

function conciseReviewText(value: unknown, limit: number) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, Math.max(0, limit - 3))}...` : normalized;
}

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
}

function extractOpenAiOutputText(response: unknown) {
  if (!response || typeof response !== "object") return "";
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;

  const output = record.output;
  if (Array.isArray(output)) {
    const chunks = output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const partRecord = part as Record<string, unknown>;
        return typeof partRecord.text === "string" ? [partRecord.text] : [];
      });
    });
    if (chunks.length > 0) return chunks.join("\n");
  }

  const choices = record.choices;
  if (Array.isArray(choices)) {
    const chunks = choices.flatMap((choice) => {
      if (!choice || typeof choice !== "object") return [];
      const message = (choice as Record<string, unknown>).message;
      if (!message || typeof message !== "object") return [];
      const content = (message as Record<string, unknown>).content;
      return typeof content === "string" ? [content] : [];
    });
    if (chunks.length > 0) return chunks.join("\n");
  }

  return "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
