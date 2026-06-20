import { NextResponse } from "next/server";
import { runGoogleDriveHealthCheck } from "@/lib/google-drive-health";
import { metaStoragePolicySummary } from "@/lib/meta-storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("googleDriveHealth") === "1") {
    return NextResponse.json(
      {
        ok: false,
        error: "Google Drive health check performs a write/read/delete probe and must be requested with POST.",
      },
      { status: 405 },
    );
  }

  return NextResponse.json({
    ok: true,
    policy: metaStoragePolicySummary(),
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("googleDriveHealth") !== "1") {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported storage-policy POST request.",
      },
      { status: 400 },
    );
  }

  const health = await runGoogleDriveHealthCheck();
  return NextResponse.json(
    {
      ok: health.ok,
      health,
    },
    { status: health.ok ? 200 : 503 },
  );
}
