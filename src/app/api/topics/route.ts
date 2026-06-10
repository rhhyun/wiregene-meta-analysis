import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnabledTopics, setEnabledTopics } from "@/lib/db";
import { toOperationalError } from "@/lib/operational-error";
import { normalizeTopicProfiles } from "@/lib/topic-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const topicsSchema = z.object({
  topics: z.array(topicSchema).min(1).max(8),
});

export async function GET() {
  try {
    return NextResponse.json({ topics: await getEnabledTopics() });
  } catch (error) {
    return NextResponse.json({ error: toOperationalError(error) }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const parsed = topicsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid topic configuration.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const topics = await setEnabledTopics(normalizeTopicProfiles(parsed.data.topics));
    return NextResponse.json({ ok: true, topics });
  } catch (error) {
    return NextResponse.json({ error: toOperationalError(error) }, { status: 503 });
  }
}

