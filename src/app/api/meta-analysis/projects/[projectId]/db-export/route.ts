import { NextResponse } from "next/server";
import {
  createMetaDbExportSnapshot,
  createMetaDbExportZip,
  saveMetaDbExportSnapshot,
} from "@/lib/meta-db-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const extractionColumns = columnsFromSearchParams(url.searchParams);
  const format = (url.searchParams.get("format") ?? "zip").toLowerCase();

  try {
    if (format === "json") {
      const snapshot = await createMetaDbExportSnapshot({ projectId, extractionColumns });
      return NextResponse.json(snapshot, {
        headers: {
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="${snapshot.fileBaseName}.json"`,
        },
      });
    }

    const bundle = await createMetaDbExportZip({ projectId, extractionColumns });
    return new NextResponse(new Uint8Array(bundle.buffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${bundle.fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Meta DB export could not be generated.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const payload = await request.json().catch(() => ({}));
  const extractionColumns = columnsFromPayload((payload as { extractionColumns?: unknown }).extractionColumns);

  try {
    const saved = await saveMetaDbExportSnapshot({ projectId, extractionColumns });
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Meta DB snapshot could not be saved.",
      },
      { status: 400 },
    );
  }
}

function columnsFromSearchParams(searchParams: URLSearchParams) {
  return searchParams
    .getAll("columns")
    .flatMap(splitColumns)
    .filter(Boolean);
}

function columnsFromPayload(value: unknown) {
  if (Array.isArray(value)) return value.map((column) => String(column).trim()).filter(Boolean);
  if (typeof value === "string") return splitColumns(value);
  return [];
}

function splitColumns(value: string) {
  return value
    .split(/[\n,]+/)
    .map((column) => column.trim())
    .filter(Boolean);
}
