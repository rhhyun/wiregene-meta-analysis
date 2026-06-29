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
import { normalizeMetaFullTextResearcherGuidance } from "@/lib/meta-full-text-prompt-guidance";
import { cleanMetaProjectId } from "@/lib/meta-project-scope";
import { orchestralPainProject } from "@/lib/meta-projects";
import { googleDriveFallbackWarning, isRecoverableGoogleDriveStorageError } from "@/lib/meta-storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReanalyzeRequest = {
  reviewerIds: string[];
  projectId: string | null;
  researcherGuidance: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const startedAt = Date.now();

  try {
    const reanalyzeRequest = await parseReanalyzeRequest(request);
    const record = await getMetaFullTextHistoryRecord(id, { projectId: reanalyzeRequest.projectId });
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
      extractionColumns: mergeExtractionColumns(record.analysis.extraction.columns, orchestralPainProject.extractionColumns),
      reviewerIds: reanalyzeRequest.reviewerIds,
      researcherGuidance: reanalyzeRequest.researcherGuidance,
    });
    const nextAnalysis = reanalyzeRequest.reviewerIds.length
      ? mergeSelectedModelReviewsIntoPrimary(record.analysis, analysis)
      : analysis;
    const updated = await replaceMetaFullTextHistoryAnalysis(id, nextAnalysis, { projectId: reanalyzeRequest.projectId });
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
    const storageUnavailable = fullTextStorageUnavailableResponse(error, "Saved full-text source could not be reanalyzed.");
    if (storageUnavailable) return storageUnavailable;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text source could not be reanalyzed.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

function fullTextStorageUnavailableResponse(error: unknown, fallbackError: string) {
  const details = metaFullTextHistoryStorageErrorDetails(error);
  if (!isRecoverableGoogleDriveStorageError(error) && !isRecoverableGoogleDriveStorageError(details)) return null;
  return NextResponse.json(
    {
      error: fallbackError,
      details,
      storage: {
        unavailable: true,
        warning: googleDriveFallbackWarning(details),
        details,
        reconnectUrl: "/api/google-drive/oauth/start?diagnose=1",
        storagePolicyUrl: "/api/meta-analysis/storage-policy?googleDriveHealth=1",
      },
    },
    {
      status: 503,
      headers: { "cache-control": "no-store" },
    },
  );
}

async function parseReanalyzeRequest(request: Request): Promise<ReanalyzeRequest> {
  const urlProjectId = cleanMetaProjectId(new URL(request.url).searchParams.get("projectId"));
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { reviewerIds: [], projectId: urlProjectId || null, researcherGuidance: null };
  }
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    reviewerIds: normalizeReviewerIds(payload.reviewerIds),
    projectId: cleanMetaProjectId(payload.projectId) || urlProjectId || null,
    researcherGuidance: normalizeMetaFullTextResearcherGuidance(
      typeof payload.researcherGuidance === "string" ? payload.researcherGuidance : "",
    ),
  };
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

function mergeExtractionColumns(current: string[], project: string[]) {
  return Array.from(
    new Set(
      [...current, ...project]
        .map((column) => String(column).trim())
        .filter(Boolean),
    ),
  );
}

function mergeSelectedModelReviewsIntoPrimary(current: MetaFullTextAnalysis, selected: MetaFullTextAnalysis): MetaFullTextAnalysis {
  const selectedHasUsableAi = selected.aiUsed && selected.modelReviews.some((review) => review.aiUsed);
  if (!selected.modelReviews.length || !selectedHasUsableAi) {
    return {
      ...current,
      analyzedAt: new Date().toISOString(),
      aiWarning: selected.aiWarning ?? current.aiWarning,
      modelReviews: mergeModelReviews(current.modelReviews ?? [], selected.modelReviews ?? []),
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

  return {
    ...selected,
    analyzedAt: new Date().toISOString(),
    aiWarning: selected.aiWarning ?? current.aiWarning,
    modelReviews: mergeModelReviews(current.modelReviews ?? [], selected.modelReviews),
    nextActions: Array.from(new Set([...selected.nextActions, ...current.nextActions].filter(Boolean))).slice(0, 8),
    extraction: {
      ...selected.extraction,
      validationIssues: Array.from(
        new Set([
          ...selected.extraction.validationIssues,
          ...current.extraction.validationIssues,
        ].filter(Boolean)),
      ),
    },
  };
}

function mergeModelReviews(current: MetaFullTextModelReview[], selected: MetaFullTextModelReview[]) {
  const mergedReviews: MetaFullTextModelReview[] = [];
  const reviewById = new Map<string, MetaFullTextModelReview>();
  for (const review of current) reviewById.set(review.reviewerId, review);
  for (const review of selected) reviewById.set(review.reviewerId, review);
  const preferredOrder = [...current, ...selected].map((review) => review.reviewerId);
  for (const reviewerId of preferredOrder) {
    const review = reviewById.get(reviewerId);
    if (review && !mergedReviews.some((item) => item.reviewerId === reviewerId)) mergedReviews.push(review);
  }
  return mergedReviews;
}
