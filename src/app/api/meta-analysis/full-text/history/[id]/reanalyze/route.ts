import { NextResponse } from "next/server";
import {
  analyzeMetaFullTextUpload,
  type MetaFullTextAnalysis,
  type MetaFullTextModelReview,
} from "@/lib/meta-full-text-analysis";
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

type ReanalyzeRequest = {
  reviewerIds: string[];
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const startedAt = Date.now();

  try {
    const reanalyzeRequest = await parseReanalyzeRequest(request);
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
      reviewerIds: reanalyzeRequest.reviewerIds,
    });
    const nextAnalysis = reanalyzeRequest.reviewerIds.length
      ? mergeSelectedModelReviews(record.analysis, analysis)
      : analysis;
    const updated = await replaceMetaFullTextHistoryAnalysis(id, nextAnalysis);
    if (!updated) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });

    return NextResponse.json({
      record: updated,
      diagnostics: {
        status: "reanalyzed",
        sourceStorage: record.sourceFile.storage,
        reviewerIds: reanalyzeRequest.reviewerIds,
        mergedModelReviewCount: nextAnalysis.modelReviews.length,
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

async function parseReanalyzeRequest(request: Request): Promise<ReanalyzeRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return { reviewerIds: [] };
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return { reviewerIds: normalizeReviewerIds(payload.reviewerIds) };
}

function normalizeReviewerIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.replace(/[^a-zA-Z0-9_-]/g, "").trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 3);
}

function mergeSelectedModelReviews(current: MetaFullTextAnalysis, selected: MetaFullTextAnalysis): MetaFullTextAnalysis {
  if (!selected.modelReviews.length) {
    return {
      ...current,
      analyzedAt: new Date().toISOString(),
      aiWarning: selected.aiWarning ?? current.aiWarning,
      extraction: {
        ...current.extraction,
        validationIssues: Array.from(
          new Set([
            ...current.extraction.validationIssues,
            ...selected.extraction.validationIssues,
          ].filter(Boolean)),
        ),
      },
    };
  }

  const mergedReviews: MetaFullTextModelReview[] = [];
  const reviewById = new Map<string, MetaFullTextModelReview>();
  for (const review of current.modelReviews ?? []) {
    reviewById.set(review.reviewerId, review);
  }
  for (const review of selected.modelReviews) {
    reviewById.set(review.reviewerId, review);
  }
  const preferredOrder = [...(current.modelReviews ?? []), ...selected.modelReviews].map((review) => review.reviewerId);
  for (const reviewerId of preferredOrder) {
    const review = reviewById.get(reviewerId);
    if (review && !mergedReviews.some((item) => item.reviewerId === reviewerId)) mergedReviews.push(review);
  }

  return {
    ...current,
    analyzedAt: new Date().toISOString(),
    aiWarning: selected.aiWarning ?? current.aiWarning,
    modelReviews: mergedReviews,
    nextActions: Array.from(new Set([...selected.nextActions, ...current.nextActions].filter(Boolean))).slice(0, 8),
    extraction: {
      ...current.extraction,
      validationIssues: Array.from(
        new Set([
          ...current.extraction.validationIssues,
          ...selected.extraction.validationIssues,
        ].filter(Boolean)),
      ),
    },
  };
}
