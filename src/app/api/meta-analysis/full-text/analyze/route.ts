import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMetaFullTextUpload } from "@/lib/meta-full-text-analysis";
import {
  metaFullTextHistoryStorageErrorDetails,
  saveMetaFullTextHistory,
} from "@/lib/meta-full-text-history";
import { orchestralPainProject } from "@/lib/meta-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxColumnPayloadCharacters) : "";
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
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "full-text PDF, Word(.doc/.docx), TXT 파일을 multipart/form-data로 보내 주세요." },
      { status: 400 },
    );
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File) || uploaded.size === 0) {
    return NextResponse.json({ error: "분석할 full-text PDF/Word/TXT 파일을 업로드해 주세요." }, { status: 400 });
  }

  const referenceRecord = formString(formData, "referenceRecord");
  const sourceSheet = formString(formData, "sourceSheet");
  const sourceLabel = formString(formData, "sourceLabel");
  const reviewMode = formString(formData, "reviewMode");
  const reviewerOneName = formString(formData, "reviewerOneName");
  const reviewerTwoName = formString(formData, "reviewerTwoName");
  const requestedColumns = columnsSchema.parse(formString(formData, "extractionColumns"));
  const extractionColumns = allowedExtractionColumns(requestedColumns);

  try {
    const analysis = await analyzeMetaFullTextUpload({
      buffer: Buffer.from(await uploaded.arrayBuffer()),
      fileName: uploaded.name,
      mimeType: uploaded.type,
      referenceRecord: referenceRecord || null,
      extractionColumns,
    });

    try {
      const savedRecord = await saveMetaFullTextHistory({
        analysis,
        sourceSheet,
        sourceLabel,
        reviewMode,
        referenceRecord: referenceRecord || null,
        reviewerOneName,
        reviewerTwoName,
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
          verificationComplete: false,
          reviewerOneName: savedRecord.verification.reviewerOneName,
          reviewerTwoName: savedRecord.verification.reviewerTwoName,
        },
      });
    } catch (saveError) {
      return NextResponse.json({
        analysis,
        savedRecord: null,
        saveError: metaFullTextHistoryStorageErrorDetails(saveError),
      });
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "full-text 분석에 실패했습니다. PDF가 스캔본이면 OCR 처리 후, Word 파일은 읽을 수 있는 .doc/.docx 또는 PDF로 다시 업로드해 주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
