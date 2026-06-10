import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { generateResearchReport } from "@/lib/report-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  const report = await generateResearchReport(7);
  return NextResponse.json({
    ok: true,
    reportId: report.id,
    itemCount: report.items.length,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
