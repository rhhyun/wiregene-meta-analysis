import { NextResponse } from "next/server";
import {
  getGoogleDriveFileMetadata,
  readBinaryFileFromGoogleDrive,
} from "@/lib/google-drive-storage";
import {
  getMetaFullTextHistoryRecord,
  metaFullTextHistoryStorageErrorDetails,
  updateMetaFullTextSourceFile,
} from "@/lib/meta-full-text-history";
import { saveMetaFullTextSourceFile } from "@/lib/meta-full-text-source-files";
import { cleanMetaProjectId } from "@/lib/meta-project-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SourceAttachInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  driveFileId: string | null;
  projectId: string | null;
};

const maxStringCharacters = 4_000;

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const input = await parseSourceAttachRequest(request);
    const record = await getMetaFullTextHistoryRecord(id, { projectId: input.projectId });
    if (!record) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });

    const sourceFile = await saveMetaFullTextSourceFile({
      buffer: input.buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      existingDriveFileId: input.driveFileId,
      projectId: input.projectId,
    });
    const updated = await updateMetaFullTextSourceFile(id, sourceFile, { projectId: input.projectId });
    if (!updated) return NextResponse.json({ error: "Saved full-text analysis was not found." }, { status: 404 });

    return NextResponse.json({
      record: updated,
      sourceFile,
      diagnostics: {
        status: "source_saved",
        sourceStorage: sourceFile.storage,
        fileName: sourceFile.fileName,
        fileSize: sourceFile.fileSize,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Full-text source could not be saved to this record.",
        details: metaFullTextHistoryStorageErrorDetails(error),
      },
      { status: 400 },
    );
  }
}

async function parseSourceAttachRequest(request: Request): Promise<SourceAttachInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) return parseGoogleDriveSourceRequest(request);
  return parseMultipartSourceRequest(request);
}

async function parseMultipartSourceRequest(request: Request): Promise<SourceAttachInput> {
  const formData = await request.formData();
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File) || uploaded.size === 0) {
    throw new Error("Choose the original full-text PDF, Word, TXT, or MD file to save to this legacy record.");
  }

  return {
    buffer: Buffer.from(await uploaded.arrayBuffer()),
    fileName: uploaded.name,
    mimeType: uploaded.type || "application/octet-stream",
    fileSize: uploaded.size,
    driveFileId: null,
    projectId: cleanMetaProjectId(formString(formData, "projectId")) || null,
  };
}

async function parseGoogleDriveSourceRequest(request: Request): Promise<SourceAttachInput> {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const driveFileId = payloadString(payload, "driveFileId");
  if (!driveFileId) throw new Error("driveFileId is required to save a Google Drive full-text source.");

  const metadata = await getGoogleDriveFileMetadata(driveFileId);
  const buffer = await readBinaryFileFromGoogleDrive(driveFileId);
  const metadataSize = Number(metadata.size ?? "");
  const fileSize =
    payloadNumber(payload, "fileSize") ?? (Number.isFinite(metadataSize) && metadataSize >= 0 ? metadataSize : buffer.length);

  return {
    buffer,
    fileName: payloadString(payload, "fileName") || metadata.name || `google-drive-${driveFileId}`,
    mimeType: payloadString(payload, "mimeType") || metadata.mimeType || "application/octet-stream",
    fileSize,
    driveFileId,
    projectId: cleanMetaProjectId(payload.projectId) || null,
  };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxStringCharacters) : "";
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim().slice(0, maxStringCharacters) : "";
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}
