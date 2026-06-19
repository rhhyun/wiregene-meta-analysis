import { NextResponse } from "next/server";
import {
  getMetaFullTextHistoryOverview,
  metaFullTextHistoryStorageErrorDetails,
  updateMetaFullTextReviewerSettings,
} from "@/lib/meta-full-text-history";
import { cleanMetaProjectId } from "@/lib/meta-project-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultHistoryLimit = 500;

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text analyses could not be loaded.",
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
