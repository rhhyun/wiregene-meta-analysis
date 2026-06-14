import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChunkForwardErrorDetails = {
  requestId: string;
  phase: string;
  fileName: string | null;
  chunkStart: number | null;
  chunkEnd: number | null;
  fileSize: number | null;
  chunkBytes: number | null;
  httpStatus?: number;
  googleRange?: string | null;
  message: string;
  help: string;
};

function headerString(request: Request, name: string) {
  const value = request.headers.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function headerNumber(request: Request, name: string) {
  const value = Number(headerString(request, name));
  return Number.isFinite(value) ? value : null;
}

function decodeHeaderValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function googleUploadUrl(value: string) {
  if (!value) {
    throw new Error("Missing Google Drive upload URL.");
  }
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!host.endsWith("googleapis.com") && !host.endsWith("googleusercontent.com")) {
    throw new Error("Upload URL is not a Google Drive upload endpoint.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Google Drive upload URL must use HTTPS.");
  }
  return url.toString();
}

function errorResponse(details: ChunkForwardErrorDetails, status = 400) {
  return NextResponse.json(
    {
      error: "Large-file chunk upload failed before analysis.",
      details,
    },
    { status },
  );
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const fileName = decodeHeaderValue(headerString(request, "x-wiregene-file-name")).slice(0, 260) || null;
  const chunkStart = headerNumber(request, "x-wiregene-chunk-start");
  const chunkEnd = headerNumber(request, "x-wiregene-chunk-end");
  const fileSize = headerNumber(request, "x-wiregene-file-size");

  try {
    const uploadUrl = googleUploadUrl(headerString(request, "x-wiregene-upload-url"));

    if (
      chunkStart === null ||
      chunkEnd === null ||
      fileSize === null ||
      chunkStart < 0 ||
      chunkEnd < chunkStart ||
      fileSize <= chunkEnd
    ) {
      throw new Error("Invalid upload chunk range headers.");
    }

    const chunkBuffer = Buffer.from(await request.arrayBuffer());
    const expectedBytes = chunkEnd - chunkStart + 1;
    if (chunkBuffer.byteLength !== expectedBytes) {
      throw new Error(`Chunk byte length mismatch. Expected ${expectedBytes}, received ${chunkBuffer.byteLength}.`);
    }

    const googleResponse = await fetch(uploadUrl, {
      method: "PUT",
      redirect: "manual",
      headers: {
        "Content-Range": `bytes ${chunkStart}-${chunkEnd}/${fileSize}`,
        "Content-Type": "application/octet-stream",
      },
      body: chunkBuffer,
    });

    const googleRange = googleResponse.headers.get("range");
    const rawText = await googleResponse.text().catch(() => "");
    if (googleResponse.status === 308) {
      return NextResponse.json({
        complete: false,
        requestId,
        receivedRange: googleRange,
        chunk: {
          start: chunkStart,
          end: chunkEnd,
          bytes: chunkBuffer.byteLength,
          fileSize,
        },
        elapsedMs: Date.now() - startedAt,
      });
    }

    if (!googleResponse.ok) {
      return errorResponse(
        {
          requestId,
          phase: "forward_chunk_to_google_drive",
          fileName,
          chunkStart,
          chunkEnd,
          fileSize,
          chunkBytes: chunkBuffer.byteLength,
          httpStatus: googleResponse.status,
          googleRange,
          message: rawText.trim() || `Google Drive returned HTTP ${googleResponse.status}.`,
          help:
            "The browser reached the Meta server, but Google Drive rejected this upload chunk. Regenerate Google Drive credentials and retry; if this repeats, use the Synology/local Docker deployment for very large batches.",
        },
        502,
      );
    }

    const file = rawText.trim() ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    return NextResponse.json({
      complete: true,
      requestId,
      file,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[meta-full-text/upload-chunk] failed", {
      requestId,
      fileName,
      chunkStart,
      chunkEnd,
      fileSize,
      error: message,
      elapsedMs: Date.now() - startedAt,
    });
    return errorResponse(
      {
        requestId,
        phase: "receive_or_forward_upload_chunk",
        fileName,
        chunkStart,
        chunkEnd,
        fileSize,
        chunkBytes: null,
        message,
        help:
          "The large file is now uploaded through the Meta same-origin chunk proxy. If this message appears, check the request id in server logs and verify the Google Drive resumable upload session is still valid.",
      },
      400,
    );
  }
}
