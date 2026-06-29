import { NextResponse } from "next/server";
import {
  deleteMetaFullTextHistoryRecords,
  getMetaFullTextHistoryOverview,
  metaFullTextHistoryStorageErrorDetails,
  summarizeMetaFullTextHistoryRecord,
  updateMetaFullTextReviewerSettings,
} from "@/lib/meta-full-text-history";
import { cleanMetaProjectId } from "@/lib/meta-project-scope";
import { googleDriveFallbackWarning, isRecoverableGoogleDriveStorageError } from "@/lib/meta-storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultHistoryLimit = 500;

type DeleteHistoryPayload = {
  projectId?: unknown;
  ids?: unknown;
};

function cleanDeleteId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDeleteIds(payload: DeleteHistoryPayload, url: URL) {
  const bodyIds = Array.isArray(payload.ids)
    ? payload.ids.map(cleanDeleteId)
    : typeof payload.ids === "string"
      ? payload.ids.split(",").map(cleanDeleteId)
      : [];
  const queryIds = (url.searchParams.get("ids") ?? "").split(",").map(cleanDeleteId);
  return Array.from(new Set([...bodyIds, ...queryIds].filter(Boolean))).slice(0, defaultHistoryLimit);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? defaultHistoryLimit);
  const projectId = cleanMetaProjectId(url.searchParams.get("projectId"));

  try {
    const overview = await getMetaFullTextHistoryOverview(Number.isFinite(limit) ? limit : defaultHistoryLimit, {
      projectId,
    });
    return NextResponse.json(overview);
  } catch (error) {
    if (isRecoverableGoogleDriveStorageError(error)) {
      return NextResponse.json(
        {
          records: [],
          reviewerSettings: {
            reviewerOneName: "",
            reviewerTwoName: "",
            updatedAt: null,
          },
          stats: {
            totalCount: 0,
            verificationCompletedCount: 0,
          },
          storage: {
            unavailable: true,
            warning: googleDriveFallbackWarning(error),
            details: metaFullTextHistoryStorageErrorDetails(error),
            reconnectUrl: "/api/google-drive/oauth/start?diagnose=1",
            storagePolicyUrl: "/api/meta-analysis/storage-policy?googleDriveHealth=1",
          },
        },
        {
          status: 200,
          headers: { "cache-control": "no-store" },
        },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text analyses could not be loaded.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const payload = (await request.json().catch(() => ({}))) as DeleteHistoryPayload;
  const projectId =
    cleanMetaProjectId(typeof payload.projectId === "string" ? payload.projectId : null) ||
    cleanMetaProjectId(url.searchParams.get("projectId"));
  const ids = parseDeleteIds(payload, url);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one saved full-text analysis record to delete." }, { status: 400 });
  }

  try {
    const deleted = await deleteMetaFullTextHistoryRecords(ids, { projectId });
    if (!deleted) return NextResponse.json({ error: "No matching saved full-text analyses were found." }, { status: 404 });
    const overview = await getMetaFullTextHistoryOverview(defaultHistoryLimit, { projectId });
    const deletedRecords = deleted.records.map(summarizeMetaFullTextHistoryRecord);

    return NextResponse.json({
      ...overview,
      deletedRecord: deletedRecords[0] ?? null,
      deletedRecords,
      sourceFileDeleted: deleted.sourceFileDeletedCount > 0,
      sourceFileDeletedCount: deleted.sourceFileDeletedCount,
      sourceFileDeleteWarning: deleted.sourceFileDeleteWarnings[0] ?? null,
      sourceFileDeleteWarnings: deleted.sourceFileDeleteWarnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text analyses could not be deleted.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const payload = await request.json().catch(() => ({}));
  const projectId = cleanMetaProjectId(payload.projectId) || cleanMetaProjectId(url.searchParams.get("projectId"));

  try {
    const reviewerSettings = await updateMetaFullTextReviewerSettings({
      reviewerOneName: payload.reviewerOneName,
      reviewerTwoName: payload.reviewerTwoName,
    }, { projectId });
    const overview = await getMetaFullTextHistoryOverview(defaultHistoryLimit, { projectId });
    return NextResponse.json({ ...overview, reviewerSettings });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Reviewer settings could not be saved.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}
