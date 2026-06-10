import { NextResponse } from "next/server";
import { z } from "zod";
import { isManualRunAllowed } from "@/lib/auth";
import { saveReport, setEnabledTopics } from "@/lib/db";
import { buildResearchReportPayload, generateResearchReport } from "@/lib/report-generator";
import { normalizeTopicProfiles } from "@/lib/topic-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxDaysBack = 365;

const topicSchema = z.object({
  slug: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  terms: z.array(z.string()).optional(),
  meshTerms: z.array(z.string()).optional(),
  koreanTerms: z.array(z.string()).optional(),
  highImpactJournals: z.array(z.string()).optional(),
  usNewsTerms: z.array(z.string()).optional(),
  krNewsTerms: z.array(z.string()).optional(),
});

const daysBackSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.coerce.number().int().min(1).max(maxDaysBack).optional(),
);

const runSchema = z.object({
  daysBack: daysBackSchema,
  applyMode: z.enum(["one-time", "ongoing"]).optional(),
  topics: z.array(topicSchema).min(1).max(8).optional(),
});

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  if (!isManualRunAllowed()) {
    return NextResponse.json(
      { error: "Manual report generation is disabled in production." },
      { status: 403 },
    );
  }

  const parsed = runSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manual run options.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const daysBack = parsed.data.daysBack ?? 7;
  const topics = parsed.data.topics ? normalizeTopicProfiles(parsed.data.topics) : null;

  if (!topics) {
    const report = await generateResearchReport(daysBack);
    return NextResponse.json({
      ok: true,
      reportId: report.id,
      itemCount: report.items.length,
      applyMode: "current",
      daysBack,
    });
  }

  if (parsed.data.applyMode === "ongoing") {
    await setEnabledTopics(topics);
  }

  const payload = await buildResearchReportPayload(daysBack, async () => topics);
  const report = await saveReport(payload.report, payload.items);
  return NextResponse.json({
    ok: true,
    reportId: report.id,
    itemCount: report.items.length,
    applyMode: parsed.data.applyMode ?? "one-time",
    daysBack,
  });
}
