import { NextResponse } from "next/server";
import {
  getMetaExtractionDatasetOverview,
  metaExtractionDatasetColumns,
  metaExtractionDatasetScope,
  saveMetaExtractionDatasetRecord,
} from "@/lib/meta-extraction-dataset";
import { createMetaExtractionDatasetXlsx } from "@/lib/meta-extraction-xlsx";
import { metaFullTextHistoryStorageErrorDetails } from "@/lib/meta-full-text-history";
import { googleDriveFallbackWarning, isRecoverableGoogleDriveStorageError } from "@/lib/meta-storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = metaExtractionDatasetScope({
    projectId: url.searchParams.get("projectId"),
    extractionColumns: columnsFromQuery(url.searchParams),
  });

  try {
    const overview = await getMetaExtractionDatasetOverview(scope);
    const format = url.searchParams.get("format");
    if (format === "xlsx") {
      const workbook = await createMetaExtractionDatasetXlsx(overview);
      return new NextResponse(new Uint8Array(workbook), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="wiregene-meta-extraction-dataset.xlsx"`,
          "cache-control": "no-store",
        },
      });
    }
    return NextResponse.json(overview);
  } catch (error) {
    const format = url.searchParams.get("format");
    const details = metaFullTextHistoryStorageErrorDetails(error);
    if (format !== "xlsx" && (isRecoverableGoogleDriveStorageError(error) || isRecoverableGoogleDriveStorageError(details))) {
      const columns = metaExtractionDatasetColumns(scope.extractionColumns);
      return NextResponse.json(
        {
          columns,
          records: [],
          csv: columns.join(","),
          stats: {
            includedRecordCount: 0,
            excelRowCount: 0,
            verifiedRowCount: 0,
            manualRequiredFieldCount: 0,
            evidenceBackedFieldCount: 0,
            autoFilledFieldCount: 0,
            blankFieldCount: 0,
            editableFieldCount: 0,
          },
          updatedAt: new Date().toISOString(),
          storage: {
            unavailable: true,
            warning: googleDriveFallbackWarning(details),
            details,
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
        error: error instanceof Error ? error.message : "Extraction dataset could not be loaded.",
        details,
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const historyId = typeof payload.historyId === "string" ? payload.historyId : "";
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const scope = metaExtractionDatasetScope({
    projectId: typeof payload.projectId === "string" ? payload.projectId : "",
    extractionColumns: columnsFromPayload(payload.extractionColumns),
  });
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
      projectId: scope.projectId,
    });
    if (!record) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });
    const overview = await getMetaExtractionDatasetOverview(scope);
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

function columnsFromQuery(searchParams: URLSearchParams) {
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
