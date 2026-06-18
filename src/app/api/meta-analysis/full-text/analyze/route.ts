import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getGoogleDriveFileMetadata,
  readBinaryFileFromGoogleDrive,
} from "@/lib/google-drive-storage";
import { analyzeMetaFullTextUpload } from "@/lib/meta-full-text-analysis";
import {
  metaFullTextHistoryStorageErrorDetails,
  saveMetaFullTextHistory,
} from "@/lib/meta-full-text-history";
import { saveMetaFullTextSourceFile } from "@/lib/meta-full-text-source-files";
import { orchestralPainProject } from "@/lib/meta-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const maxColumnPayloadCharacters = 4_000;

const columnsSchema = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(/[\n,]+/)
      .map((column) => column.trim())
      .filter(Boolean),
  );

const reviewerIdsSchema = z
  .string()
  .optional()
  .transform((value) => normalizeReviewerIds((value ?? "").split(/[\n,]+/)));

type FullTextUploadSource = "multipart" | "google-drive";

type AnalyzeRequestContext = {
  requestId: string;
  startedAt: number;
  phase: string;
  source: FullTextUploadSource | "unknown";
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  contentLength: string | null;
};

type AnalyzeRequestInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  referenceRecord: string | null;
  sourceSheet: string;
  sourceLabel: string;
  reviewMode: string;
  reviewerOneName: string;
  reviewerTwoName: string;
  extractionColumns: string[];
  reviewerIds: string[];
  driveFileId: string | null;
};

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxColumnPayloadCharacters) : "";
}

function payloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim().slice(0, maxColumnPayloadCharacters) : "";
}

function payloadNumber(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function payloadColumns(payload: unknown) {
  if (!payload || typeof payload !== "object") return orchestralPainProject.extractionColumns;
  const value = (payload as Record<string, unknown>).extractionColumns;
  if (Array.isArray(value)) {
    return allowedExtractionColumns(value.map((column) => String(column).trim()).filter(Boolean));
  }
  return allowedExtractionColumns(columnsSchema.parse(typeof value === "string" ? value : ""));
}

function payloadReviewerIds(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>).reviewerIds;
  if (Array.isArray(value)) return normalizeReviewerIds(value);
  return reviewerIdsSchema.parse(typeof value === "string" ? value : "");
}

function allowedExtractionColumns(requestedColumns: string[]) {
  if (requestedColumns.length === 0) return orchestralPainProject.extractionColumns;
  const allowed = new Set(orchestralPainProject.extractionColumns);
  const filtered = requestedColumns.filter((column) => allowed.has(column));
  return filtered.length > 0 && filtered.length <= orchestralPainProject.extractionColumns.length
    ? filtered
    : orchestralPainProject.extractionColumns;
}

export async function POST(request: Request) {
  const context: AnalyzeRequestContext = {
    requestId: randomUUID(),
    startedAt: Date.now(),
    phase: "start",
    source: "unknown",
    fileName: null,
    fileSize: null,
    mimeType: null,
    contentLength: request.headers.get("content-length"),
  };

  try {
    const input = await parseAnalyzeRequest(request, context);
    return await analyzeAndSave(input, context);
  } catch (error) {
    console.error("[meta-full-text/analyze] failed", {
      requestId: context.requestId,
      phase: context.phase,
      source: context.source,
      fileName: context.fileName,
      fileSize: context.fileSize,
      mimeType: context.mimeType,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - context.startedAt,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "full-text analysis failed.",
        details: errorDiagnostics(error, context),
      },
      { status: 400 },
    );
  }
}

async function parseAnalyzeRequest(request: Request, context: AnalyzeRequestContext): Promise<AnalyzeRequestInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    return parseGoogleDriveAnalyzeRequest(request, context);
  }
  return parseMultipartAnalyzeRequest(request, context);
}

async function parseMultipartAnalyzeRequest(
  request: Request,
  context: AnalyzeRequestContext,
): Promise<AnalyzeRequestInput> {
  context.phase = "parse_multipart";
  context.source = "multipart";
  const formData = await request.formData();
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File) || uploaded.size === 0) {
    throw new Error("Upload a full-text PDF, Word(.doc/.docx), TXT, or MD file before analysis.");
  }

  context.fileName = uploaded.name;
  context.fileSize = uploaded.size;
  context.mimeType = uploaded.type || null;
  console.info("[meta-full-text/analyze] multipart upload received", diagnostics(context));

  context.phase = "read_multipart_file";
  const buffer = Buffer.from(await uploaded.arrayBuffer());
  return {
    buffer,
    fileName: uploaded.name,
    mimeType: uploaded.type,
    fileSize: uploaded.size,
    referenceRecord: formString(formData, "referenceRecord") || null,
    sourceSheet: formString(formData, "sourceSheet"),
    sourceLabel: formString(formData, "sourceLabel"),
    reviewMode: formString(formData, "reviewMode"),
    reviewerOneName: formString(formData, "reviewerOneName"),
    reviewerTwoName: formString(formData, "reviewerTwoName"),
    extractionColumns: allowedExtractionColumns(columnsSchema.parse(formString(formData, "extractionColumns"))),
    reviewerIds: reviewerIdsSchema.parse(formString(formData, "reviewerIds")),
    driveFileId: null,
  };
}

async function parseGoogleDriveAnalyzeRequest(
  request: Request,
  context: AnalyzeRequestContext,
): Promise<AnalyzeRequestInput> {
  context.phase = "parse_google_drive_reference";
  context.source = "google-drive";
  const payload = await request.json();
  const driveFileId = payloadString(payload, "driveFileId");
  if (!driveFileId) throw new Error("driveFileId is required for Google Drive full-text analysis.");

  context.phase = "download_google_drive_file";
  const metadata = await getGoogleDriveFileMetadata(driveFileId);
  const buffer = await readBinaryFileFromGoogleDrive(driveFileId);
  const fileName = payloadString(payload, "fileName") || metadata.name || `google-drive-${driveFileId}`;
  const mimeType = payloadString(payload, "mimeType") || metadata.mimeType || "application/octet-stream";
  const metadataSize = Number(metadata.size ?? "");
  const fileSize =
    payloadNumber(payload, "fileSize") ?? (Number.isFinite(metadataSize) && metadataSize >= 0 ? metadataSize : buffer.length);

  context.fileName = fileName;
  context.fileSize = fileSize;
  context.mimeType = mimeType;
  console.info("[meta-full-text/analyze] google-drive upload received", {
    ...diagnostics(context),
    driveFileId,
  });

  return {
    buffer,
    fileName,
    mimeType,
    fileSize,
    referenceRecord: payloadString(payload, "referenceRecord") || null,
    sourceSheet: payloadString(payload, "sourceSheet"),
    sourceLabel: payloadString(payload, "sourceLabel"),
    reviewMode: payloadString(payload, "reviewMode"),
    reviewerOneName: payloadString(payload, "reviewerOneName"),
    reviewerTwoName: payloadString(payload, "reviewerTwoName"),
    extractionColumns: payloadColumns(payload),
    reviewerIds: payloadReviewerIds(payload),
    driveFileId,
  };
}

async function analyzeAndSave(input: AnalyzeRequestInput, context: AnalyzeRequestContext) {
  context.phase = "save_source_file";
  const sourceFile = await saveMetaFullTextSourceFile({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    existingDriveFileId: input.driveFileId,
  });

  context.phase = "analyze_full_text";
  const analysis = await analyzeMetaFullTextUpload({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
    referenceRecord: input.referenceRecord,
    extractionColumns: input.extractionColumns,
    reviewerIds: input.reviewerIds,
  });

  console.info("[meta-full-text/analyze] analysis completed", {
    ...diagnostics(context),
    fileType: analysis.fileType,
    extractedTextLength: analysis.extractedTextLength,
    aiUsed: analysis.aiUsed,
  });

  context.phase = "save_history";
  try {
    const savedRecord = await saveMetaFullTextHistory({
      analysis,
      sourceSheet: input.sourceSheet,
      sourceLabel: input.sourceLabel,
      reviewMode: input.reviewMode,
      referenceRecord: input.referenceRecord,
      reviewerOneName: input.reviewerOneName,
      reviewerTwoName: input.reviewerTwoName,
      sourceFile,
    });

    console.info("[meta-full-text/analyze] history saved", {
      ...diagnostics(context),
      historyId: savedRecord.id,
    });

    return NextResponse.json({
      analysis,
      savedRecord: {
        id: savedRecord.id,
        fileName: savedRecord.fileName,
        sourceSheet: savedRecord.sourceSheet,
        sourceLabel: savedRecord.sourceLabel,
        reviewMode: savedRecord.reviewMode,
        savedAt: savedRecord.savedAt,
        analyzedAt: savedRecord.analysis.analyzedAt,
        titleGuess: savedRecord.analysis.titleGuess,
        decision: savedRecord.analysis.eligibility.decision,
        confidence: savedRecord.analysis.eligibility.confidence,
        aiUsed: savedRecord.analysis.aiUsed,
        model: savedRecord.analysis.model,
        aiWarning: savedRecord.analysis.aiWarning,
        reviewScore: savedRecord.analysis.reviewEvaluation.score,
        reviewGrade: savedRecord.analysis.reviewEvaluation.grade,
        extractionRowCount: savedRecord.analysis.extraction.rows.length,
        missingCriticalFieldCount: savedRecord.analysis.extraction.missingCriticalFields.length,
        validationIssueCount: savedRecord.analysis.extraction.validationIssues.length,
        sourceFileSaved: Boolean(savedRecord.sourceFile),
        sourceStorage: savedRecord.sourceFile?.storage ?? null,
        verificationComplete: false,
        verificationMode: savedRecord.verification.verificationMode,
        reviewerReviewSkippedAt: savedRecord.verification.reviewerReviewSkippedAt,
        reviewerOneName: savedRecord.verification.reviewerOneName,
        reviewerTwoName: savedRecord.verification.reviewerTwoName,
        reviewerOneDecision: savedRecord.verification.reviewerOneDecision,
        reviewerTwoDecision: savedRecord.verification.reviewerTwoDecision,
        fixedExclusionReason: savedRecord.verification.fixedExclusionReason,
        conflictStatus: savedRecord.verification.conflictStatus,
        piName: savedRecord.verification.piName,
        piFinalDecision: savedRecord.verification.piFinalDecision,
        piAdjudicatedAt: savedRecord.verification.piAdjudicatedAt,
      },
      diagnostics: {
        ...diagnostics(context),
        status: "saved",
        extractedTextLength: analysis.extractedTextLength,
        aiUsed: analysis.aiUsed,
      },
    });
  } catch (saveError) {
    const details = metaFullTextHistoryStorageErrorDetails(saveError);
    console.error("[meta-full-text/analyze] history save failed", {
      ...diagnostics(context),
      details,
    });
    return NextResponse.json({
      analysis,
      savedRecord: null,
      saveError: details,
      diagnostics: {
        ...diagnostics(context),
        status: "analyzed_not_saved",
        extractedTextLength: analysis.extractedTextLength,
        aiUsed: analysis.aiUsed,
        help: "Analysis completed, but the history record was not saved. Fix storage settings, then rerun or copy the result before leaving the page.",
      },
    });
  }
}

function diagnostics(context: AnalyzeRequestContext) {
  return {
    requestId: context.requestId,
    phase: context.phase,
    source: context.source,
    fileName: context.fileName,
    fileSize: context.fileSize,
    mimeType: context.mimeType,
    contentLength: context.contentLength,
    elapsedMs: Date.now() - context.startedAt,
  };
}

function normalizeReviewerIds(value: unknown[]) {
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.replace(/[^a-zA-Z0-9_-]/g, "").trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 3);
}

function errorDiagnostics(error: unknown, context: AnalyzeRequestContext) {
  const message = error instanceof Error ? error.message : String(error);
  const nodeError = error as NodeJS.ErrnoException;
  return {
    ...diagnostics(context),
    name: error instanceof Error ? error.name : null,
    code: nodeError.code,
    message,
    help: helpForAnalyzeError(message, context),
  };
}

function helpForAnalyzeError(message: string, context: AnalyzeRequestContext) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid_grant") || normalized.includes("oauth")) {
    return "Google Drive OAuth failed. Regenerate GOOGLE_DRIVE_REFRESH_TOKEN with the same client id/secret used in deployment, then redeploy.";
  }
  if (normalized.includes("413") || normalized.includes("payload") || normalized.includes("body") || normalized.includes("too large")) {
    return "Large files on Vercel cannot be sent through the function request body. Use the Meta server chunk upload path or run the Synology/local Docker deployment.";
  }
  if (normalized.includes("dommatrix") || normalized.includes("pdf.worker") || normalized.includes("canvas")) {
    return "The PDF parser runtime did not initialize correctly. Redeploy the latest build and verify pdf-parse worker files are included.";
  }
  if (normalized.includes("password") || normalized.includes("encrypted")) {
    return "The PDF appears encrypted or password protected. Upload an unlocked full-text file.";
  }
  if (normalized.includes("text") && normalized.includes("extract")) {
    return "No machine-readable text was extracted. If this is a scanned PDF, run OCR first or upload a Word/text version.";
  }
  if (context.source === "google-drive") {
    return "Check Google Drive credentials, uploaded file permission, and whether the app can download the file it just uploaded.";
  }
  return "Check the request id in server logs. The UI now shows phase, source, file size, and storage details for this failed analysis.";
}
