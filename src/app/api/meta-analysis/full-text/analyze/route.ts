import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMetaFullTextUpload } from "@/lib/meta-full-text-analysis";
import { orchestralPainProject } from "@/lib/meta-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxUploadBytes = 60 * 1024 * 1024;
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
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxUploadBytes + maxColumnPayloadCharacters) {
    return NextResponse.json({ error: "업로드 파일은 60MB 이하로 올려 주세요." }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "full-text PDF 또는 TXT 파일을 multipart/form-data로 보내 주세요." },
      { status: 400 },
    );
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File) || uploaded.size === 0) {
    return NextResponse.json({ error: "분석할 full-text PDF/TXT 파일을 업로드해 주세요." }, { status: 400 });
  }

  if (uploaded.size > maxUploadBytes) {
    return NextResponse.json({ error: "업로드 파일은 60MB 이하로 올려 주세요." }, { status: 413 });
  }

  const referenceRecord = formString(formData, "referenceRecord");
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

    return NextResponse.json({ analysis });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "full-text PDF 분석에 실패했습니다. PDF가 스캔본이면 OCR 처리 후 다시 업로드해 주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
