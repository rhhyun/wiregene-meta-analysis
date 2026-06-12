import { NextResponse } from "next/server";
import {
  getMetaExtractionDatasetOverview,
  saveMetaExtractionDatasetRecord,
} from "@/lib/meta-extraction-dataset";
import { metaFullTextHistoryStorageErrorDetails } from "@/lib/meta-full-text-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overview = await getMetaExtractionDatasetOverview();
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Extraction dataset could not be loaded.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const historyId = typeof payload.historyId === "string" ? payload.historyId : "";
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!historyId) return NextResponse.json({ error: "historyId is required." }, { status: 400 });

  try {
    const record = await saveMetaExtractionDatasetRecord({
      historyId,
      rows: rows.filter((row): row is Record<string, string> => Boolean(row) && typeof row === "object") as Record<
        string,
        string
      >[],
      verified: Boolean(payload.verified),
      verificationNotes: typeof payload.verificationNotes === "string" ? payload.verificationNotes : "",
      verifiedBy: typeof payload.verifiedBy === "string" ? payload.verifiedBy : "",
    });
    if (!record) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });
    const overview = await getMetaExtractionDatasetOverview();
    return NextResponse.json({ record, ...overview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Extraction dataset could not be saved.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}
