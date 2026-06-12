import { NextResponse } from "next/server";
import {
  listMetaFullTextHistory,
  metaFullTextHistoryStorageErrorDetails,
} from "@/lib/meta-full-text-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  try {
    const records = await listMetaFullTextHistory(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ records });
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
