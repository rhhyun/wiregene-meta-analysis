import { NextResponse } from "next/server";
import {
  getMetaFullTextHistoryRecord,
  metaFullTextHistoryStorageErrorDetails,
  updateMetaFullTextVerification,
} from "@/lib/meta-full-text-history";
import { cleanMetaProjectId } from "@/lib/meta-project-scope";

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Saved full-text verification could not be updated.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}
