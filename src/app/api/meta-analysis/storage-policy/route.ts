import { NextResponse } from "next/server";
import { metaStoragePolicySummary } from "@/lib/meta-storage-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    policy: metaStoragePolicySummary(),
  });
}
