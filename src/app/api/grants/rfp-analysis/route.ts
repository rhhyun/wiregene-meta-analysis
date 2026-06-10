import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeGrantRfpUpload,
  fetchGrantRfpDocument,
} from "@/lib/rfp-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxUploadBytes = 30 * 1024 * 1024;

const textListSchema = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "PDF/HWPX 원문 파일이나 원문 URL을 multipart/form-data로 보내 주세요." },
      { status: 400 },
    );
  }

  const topics = textListSchema.parse(formString(formData, "topics"));
  const extraKeywords = textListSchema.parse(formString(formData, "extraKeywords"));
  const documentUrl = formString(formData, "documentUrl");
  const uploaded = formData.get("file");

  try {
    if (uploaded instanceof File && uploaded.size > 0) {
      if (uploaded.size > maxUploadBytes) {
        return NextResponse.json(
          { error: "업로드 파일은 30MB 이하로 올려 주세요." },
          { status: 413 },
        );
      }

      const analysis = await analyzeGrantRfpUpload({
        buffer: Buffer.from(await uploaded.arrayBuffer()),
        fileName: uploaded.name,
        mimeType: uploaded.type,
        documentUrl: documentUrl || null,
        topics,
        extraKeywords,
      });
      return NextResponse.json({ analysis, mode: "upload" });
    }

    if (documentUrl) {
      const downloaded = await fetchGrantRfpDocument(documentUrl);
      if (downloaded.buffer.byteLength > maxUploadBytes) {
        return NextResponse.json(
          { error: "직접 다운로드한 원문이 30MB를 초과합니다. 필요한 RFP 파일만 내려받아 업로드해 주세요." },
          { status: 413 },
        );
      }
      const analysis = await analyzeGrantRfpUpload({
        ...downloaded,
        documentUrl,
        topics,
        extraKeywords,
      });
      return NextResponse.json({ analysis, mode: "download" });
    }

    return NextResponse.json(
      { error: "분석할 PDF/HWPX 파일을 업로드하거나 접근 가능한 원문 URL을 입력해 주세요." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "원문 분석에 실패했습니다. 직접 다운로드가 막힌 경우 PDF/HWPX 파일을 내려받아 업로드해 주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
