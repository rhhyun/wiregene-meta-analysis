import { NextResponse } from "next/server";
import {
  deleteMetaFullTextHistoryRecord,
  getMetaFullTextHistoryOverview,
  getMetaFullTextHistoryRecord,
  metaFullTextHistoryStorageErrorDetails,
  summarizeMetaFullTextHistoryRecord,
  updateMetaFullTextVerification,
} from "@/lib/meta-full-text-history";
import { cleanMetaProjectId } from "@/lib/meta-project-scope";
import { googleDriveFallbackWarning, isRecoverableGoogleDriveStorageError } from "@/lib/meta-storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const projectId = cleanMetaProjectId(new URL(request.url).searchParams.get("projectId"));

  try {
    const record = await getMetaFullTextHistoryRecord(id, { projectId });
    if (!record) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });
    return NextResponse.json({ record });
  } catch (error) {
    const storageUnavailable = fullTextStorageUnavailableResponse(error, "Saved full-text analysis could not be loaded.");
    if (storageUnavailable) return storageUnavailable;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text analysis could not be loaded.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const urlProjectId = cleanMetaProjectId(new URL(request.url).searchParams.get("projectId"));
  const payload = await request.json().catch(() => ({}));
  const projectId = cleanMetaProjectId(payload.projectId) || urlProjectId;

  try {
    const record = await updateMetaFullTextVerification(id, {
      verificationMode: payload.verificationMode,
      reviewerOneName: payload.reviewerOneName,
      reviewerTwoName: payload.reviewerTwoName,
      reviewerOneDecision: payload.reviewerOneDecision,
      reviewerTwoDecision: payload.reviewerTwoDecision,
      fixedExclusionReason: payload.fixedExclusionReason,
      conflictStatus: payload.conflictStatus,
      reviewerNotes: payload.reviewerNotes,
      reviewerReviewSkipReason: payload.reviewerReviewSkipReason,
      piName: payload.piName,
      piFinalDecision: payload.piFinalDecision,
      piFinalReason: payload.piFinalReason,
    }, { projectId });
    if (!record) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });
    return NextResponse.json({ record });
  } catch (error) {
    const storageUnavailable = fullTextStorageUnavailableResponse(error, "Saved full-text verification could not be updated.");
    if (storageUnavailable) return storageUnavailable;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text verification could not be updated.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const projectId = cleanMetaProjectId(new URL(request.url).searchParams.get("projectId"));

  try {
    const deleted = await deleteMetaFullTextHistoryRecord(id, { projectId });
    if (!deleted) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });
    const overview = await getMetaFullTextHistoryOverview(500, { projectId });
    return NextResponse.json({
      ...overview,
      deletedRecord: summarizeMetaFullTextHistoryRecord(deleted.record),
      sourceFileDeleted: deleted.sourceFileDeleted,
      sourceFileDeleteWarning: deleted.sourceFileDeleteWarning,
    });
  } catch (error) {
    const storageUnavailable = fullTextStorageUnavailableResponse(error, "Saved full-text analysis could not be deleted.");
    if (storageUnavailable) return storageUnavailable;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text analysis could not be deleted.",
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
