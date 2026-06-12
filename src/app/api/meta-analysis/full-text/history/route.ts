import { NextResponse } from "next/server";
import {
  getMetaFullTextHistoryOverview,
  metaFullTextHistoryStorageErrorDetails,
  updateMetaFullTextReviewerSettings,
} from "@/lib/meta-full-text-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  try {
    const overview = await getMetaFullTextHistoryOverview(Number.isFinite(limit) ? limit : 50);
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
  const payload = await request.json().catch(() => ({}));

  try {
    const reviewerSettings = await updateMetaFullTextReviewerSettings({
      reviewerOneName: payload.reviewerOneName,
      reviewerTwoName: payload.reviewerTwoName,
    });
    const overview = await getMetaFullTextHistoryOverview(50);
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
