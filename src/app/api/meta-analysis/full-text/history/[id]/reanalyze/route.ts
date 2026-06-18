import { NextResponse } from "next/server";
import { analyzeMetaFullTextUpload } from "@/lib/meta-full-text-analysis";
import {
  getMetaFullTextHistoryRecord,
  metaFullTextHistoryStorageErrorDetails,
  replaceMetaFullTextHistoryAnalysis,
} from "@/lib/meta-full-text-history";
import { readVerifiedMetaFullTextSourceFile } from "@/lib/meta-full-text-source-files";
import { orchestralPainProject } from "@/lib/meta-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const startedAt = Date.now();

  try {
    const record = await getMetaFullTextHistoryRecord(id);
    if (!record) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });
    if (!record.sourceFile) {
      return NextResponse.json(
        {
          error: "Saved full-text source file is not available for this record.",
          details: {
            help:
              "This is likely a legacy analysis saved before source-file persistence was added. Reupload this article once; future AI model changes can reanalyze it without another upload.",
          },
        },
        { status: 409 },
      );
    }

    const buffer = await readVerifiedMetaFullTextSourceFile(record.sourceFile);
    const analysis = await analyzeMetaFullTextUpload({
      buffer,
      fileName: record.sourceFile.fileName || record.fileName,
      mimeType: record.sourceFile.mimeType,
      referenceRecord: record.referenceRecord,
      extractionColumns: record.analysis.extraction.columns.length
        ? record.analysis.extraction.columns
        : orchestralPainProject.extractionColumns,
    });
    const updated = await replaceMetaFullTextHistoryAnalysis(id, analysis);
    if (!updated) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });

    return NextResponse.json({
      record: updated,
      diagnostics: {
        status: "reanalyzed",
        sourceStorage: record.sourceFile.storage,
        elapsedMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text source could not be reanalyzed.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}
