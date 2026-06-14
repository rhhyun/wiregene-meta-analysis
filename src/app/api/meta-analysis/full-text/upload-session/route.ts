import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createGoogleDriveResumableUploadSession } from "@/lib/google-drive-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const uploadSessionSchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  mimeType: z.string().trim().max(160).optional(),
  fileSize: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  try {
    const payload = uploadSessionSchema.parse(await request.json());
    const session = await createGoogleDriveResumableUploadSession(payload);
    return NextResponse.json({
      ...session,
      requestId,
      fileName: payload.fileName,
      fileSize: payload.fileSize ?? null,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[meta-full-text/upload-session] failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: "Large-file upload session could not be created.",
        details: {
          requestId,
          phase: "create_google_drive_upload_session",
          elapsedMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
          help:
            "Large files on Vercel must use a Google Drive resumable upload session plus the Meta chunk upload route. Check GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, and GOOGLE_DRIVE_FOLDER_ID, then redeploy.",
        },
      },
      { status: 400 },
    );
  }
}
