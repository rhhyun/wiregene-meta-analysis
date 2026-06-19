import crypto from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import {
  metaAiSettingsErrorDetails,
  resolveMetaAiReviewerConfigs,
  type MetaAiReviewerConfig,
} from "./meta-ai-settings";
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

export type MetaFullTextModelReview = {
  reviewerId: string;
  label: string;
  providerType: "OPENAI" | "OPENAI_COMPATIBLE";
  modelName: string;
  baseUrl: string | null;
  analysisSchemaVersion: string;
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
  analyzedAt: string;
  aiUsed: boolean;
  model: string | null;
  aiConfigSource: "saved" | "environment" | "missing" | null;
  aiWarning: string | null;
  referenceRecord: string | null;
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
  /(?:abstract|method|methods|participants|respondents|sample|survey|questionnaire|result|results|prevalence|pain|musculoskeletal|PRMD|instrument|guitar|violin|viola|cello|orchestra|table|discussion|conclusion)/gi;

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
    });
    modelReviews.push(createModelReviewSummary(reviewer, ai.analysis, ai.warning, fallback));
    if (ai.analysis && !primaryAi) primaryAi = { analysis: ai.analysis, reviewer };
  }

  if (!primaryAi) {
    const warnings = modelReviews.map((item) => item.warning).filter(Boolean).join(" | ");
    return withAiWarning(
      {
        ...fallback,
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
    reviewer.modelName.trim().toLowerCase() === "gemini-3.5"
  ) {
    return {
      ...reviewer,
      modelName: "gemini-3.5-flash",
    };
  }
  return reviewer;
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
  text,
  analysisText,
  sourceFileSha256,
  extractionColumns,
  extractionWarnings,
}: {
  fileName: string;
  fileType: MetaFullTextFileType;
  referenceRecord: string | null;
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
    analyzedAt: new Date().toISOString(),
    aiUsed: false,
    model: null,
    aiConfigSource: null,
    aiWarning: null,
    referenceRecord,
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
}: {
  fileName: string;
  fileType: MetaFullTextFileType;
  referenceRecord: string | null;
  text: string;
  extractionColumns: string[];
  fallback: MetaFullTextAnalysis;
  reviewer: MetaAiReviewerConfig;
}): Promise<{ analysis: AiMetaFullTextAnalysis | null; warning: string | null }> {
  const openai = new OpenAI({
    apiKey: reviewer.apiKey,
    baseURL: reviewer.baseUrl ?? undefined,
    maxRetries: 0,
    timeout: 45_000,
  });
  try {
    const prompt = `You are a meticulous systematic-review and meta-analysis extraction assistant.

Task:
Analyze the uploaded full-text article for a systematic review/meta-analysis on instrument-imposed postural asymmetry and region/laterality-specific playing-related musculoskeletal pain (PRMD) in instrumental/orchestral musicians.

Important rules:
- Do not invent values. Use null or an empty string when a value is not explicitly supported.
- Eligibility is only a draft for human verification.
- Prefer quantitative inclusion only when original observational data, instrument/instrument-group data, region-specific pain outcomes, and extractable denominator/numerator or prevalence are present.
- Exclude RCTs, treatment/intervention/effect studies, case reports, reviews, conference-only records, non-English full text, wrong population, wrong outcome, and studies without extractable denominator-based pain outcomes.
- Extract numbers exactly as reported. If only percent is reported without denominator, put a note instead of fabricating n.
- Actively extract study-level characteristics that are usually in title page, abstract, Methods, Table 1, participant/general characteristics tables, affiliations, Results tables, figures, and supplements.
- Always look for and fill first_author, year, country, design, sample_size_total, sample_size_analyzed, population_source, professional_status, mean_age, female_percent, playing_hours, years_experience, instrument_group_reported, and specific_instrument when the article reports them.
- Derive country from study setting, recruitment site, sample description, or author affiliation only when no explicit study country is reported; note the source in fieldEvidence.
- Search tables/figures for instrument-specific denominators, body-region pain counts/percentages, recall window, and PRMD/pain definitions before marking these cells missing.
- For every non-empty extracted numeric cell, provide cell-level evidence with field name, value, short exact excerpt, and page/table/figure/supplement hint when available.
- For every non-empty key descriptive cell, especially first_author, country, sample_size_total, mean_age, female_percent, instrument_group_reported, and specific_instrument, provide fieldEvidence when the text/table/affiliation supports it.
- Do not fill instrument group or asymmetry mapping from background-only mentions; use actual sample/group information only.
- Never infer left/right laterality from instrument playing side. Fill left/right cells only when the article explicitly reports left/right outcomes.
- If an article is treatment/intervention/RCT/effect-focused, do not mark it quantitative unless independent baseline observational prevalence with explicit denominator/numerator is clearly extractable.
- If a numeric cell lacks source evidence, leave the cell empty or mark it needs review instead of fabricating a value.
- For risk-of-bias fields, extract only article-supported facts needed for observational-study RoB judgment: sampling/recruitment, measurement/outcome definition, confounding/adjustment, missing data, selective reporting, response rate, funding, and conflict-of-interest statements.
- For publication-bias fields, collect only study-level inputs that later funnel/small-study-effect checks need: outcome group, effect size/prevalence input, standard error or data needed to compute it, and whether the row is eligible for funnel/small-study assessment. Do not claim publication bias from a single article.
- Use rob_supporting_quote and rob_page_table for short evidence excerpts or page/table/supplement hints. If the full text lacks evidence, leave the field empty and list it in manual_required_fields.
- Keep evidence excerpts short.
- Also evaluate the quality of your own screening/extraction using the reviewEvaluation criteria below.
- Return only one JSON object.

Review evaluation criteria:
${JSON.stringify(metaReviewEvaluationCriteria, null, 2)}

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
        "conflict_status": "needs human verification"
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

    const outputText =
      reviewer.providerType === "OPENAI"
        ? await analyzeWithOpenAiResponses(openai, reviewer.modelName, extractionColumns, prompt)
        : await analyzeWithOpenAiCompatibleChat(openai, reviewer.modelName, prompt);

    if (!outputText.trim()) throw new Error("OpenAI returned an empty full-text analysis response.");
    const parsed = JSON.parse(extractJson(outputText)) as unknown;
    const validated = aiMetaFullTextAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("Meta full-text OpenAI analysis schema validation failed.", validated.error.flatten());
      return {
        analysis: null,
        warning:
          "OpenAI returned a response, but it did not match the required meta-analysis extraction schema. Fallback rules were used; retry after redeploying the latest version or changing the model.",
      };
    }
    return { analysis: validated.data as AiMetaFullTextAnalysis, warning: null };
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
    analyzedAt: new Date().toISOString(),
    sourceFileSha256: fallback.sourceFileSha256,
    inputTextLength: fallback.extractedTextLength,
    truncated: fallback.truncated,
    aiUsed: Boolean(analysis),
    decision: analysis?.eligibility?.decision ?? "uncertain",
    confidence: clamp(Number(eligibility.confidence) || 0, 0, 100),
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
        "Google Gemini OpenAI-compatible endpoint returned 404. This usually means the model id is not found for that endpoint or account. Check AI settings: use the Google OpenAI-compatible Base URL and an exact supported Gemini model id such as gemini-3.5-flash rather than gemini-3.5.",
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
      confidence: clamp(Number(analysis.eligibility.confidence) || 0, 0, 100),
      reasons: normalizeList(analysis.eligibility.reasons),
      exclusionReasons: normalizeList(analysis.eligibility.exclusionReasons),
    },
    extraction,
  );
  return {
    ...analysis,
    analysisSchemaVersion: analysis.analysisSchemaVersion || metaFullTextAnalysisSchemaVersion,
    sourceFileSha256: analysis.sourceFileSha256 || "",
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

function normalizeModelReview(review: MetaFullTextModelReview): MetaFullTextModelReview {
  const decision = allowedMetaFullTextDecisions.includes(review.decision) ? review.decision : "uncertain";
  return {
    reviewerId: String(review.reviewerId || "ai_reviewer"),
    label: String(review.label || review.modelName || "AI reviewer").replace(/\s+/g, " ").trim().slice(0, 100),
    providerType: review.providerType === "OPENAI_COMPATIBLE" ? "OPENAI_COMPATIBLE" : "OPENAI",
    modelName: String(review.modelName || "unknown-model").replace(/\s+/g, "").trim().slice(0, 120),
    baseUrl: typeof review.baseUrl === "string" && review.baseUrl.trim() ? review.baseUrl.trim() : null,
    analysisSchemaVersion: conciseReviewText(review.analysisSchemaVersion || metaFullTextAnalysisSchemaVersion, 80),
    analyzedAt: conciseReviewText(review.analyzedAt || new Date().toISOString(), 80),
    sourceFileSha256: conciseReviewText(review.sourceFileSha256 || "", 80),
    inputTextLength: Math.max(0, Number(review.inputTextLength) || 0),
    truncated: Boolean(review.truncated),
    aiUsed: Boolean(review.aiUsed),
    decision,
    confidence: clamp(Number(review.confidence) || 0, 0, 100),
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

function reviewCriterion(score: number, status: string, comment: string): MetaFullTextReviewCriterion {
  return {
    score: clamp(Number(score) || 0, 0, 100),
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
    score: clamp(Number(source.score ?? fallback.score ?? 0) || 0, 0, 100),
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
          Number(raw.score ?? 0),
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
