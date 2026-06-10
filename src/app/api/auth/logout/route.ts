import { NextResponse } from "next/server";
import { appModeLabel, getWiregeneAppMode } from "@/lib/app-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const realm = appModeLabel(getWiregeneAppMode(request.headers.get("host")));
  return new NextResponse("Logged out. Reload the app and sign in again when needed.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
    },
  });
}
