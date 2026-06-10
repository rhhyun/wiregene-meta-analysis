import { NextResponse } from "next/server";
import { getReportById } from "@/lib/db";
import { syncPapersToZotero, ZoteroSyncError } from "@/lib/zotero";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const report = await getReportById(id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  try {
    const result = await syncPapersToZotero(report.items);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZoteroSyncError) {
      console.error("Zotero sync failed", {
        reportId: id,
        code: error.code,
        status: error.status,
        message: error.message,
        details: error.details,
      });

      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          details: error.details,
        },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown Zotero sync error.";
    console.error("Unexpected Zotero sync failure", { reportId: id, message, error });
    return NextResponse.json(
      {
        ok: false,
        code: "ZOTERO_UNEXPECTED_ERROR",
        error: "Zotero sync failed unexpectedly. Check the server logs for details.",
      },
      { status: 500 },
    );
  }
}
