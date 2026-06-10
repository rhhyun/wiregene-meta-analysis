import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { getEnabledTopics, getLatestReport } from "@/lib/db";
import { normalizeTopicProfiles } from "@/lib/topic-tools";
import type { BriefingItem, TopicProfile } from "@/lib/types";

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

const requestSchema = z.object({
  mode: z.enum(["generate", "refine"]),
  topics: z.array(topicSchema).min(1).max(8).optional(),
  instructions: z.string().max(3000).optional(),
});

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "";
}

function compactItem(item: BriefingItem) {
  return {
    topicSlug: item.topicSlug,
    kind: item.kind,
    title: item.title,
    source: item.sourceName,
    date: item.publishedAt,
    summary: item.summary ?? item.snippet ?? item.abstract ?? "",
    tags: item.tags,
  };
}

function fallbackTopics(topics: TopicProfile[]) {
  return normalizeTopicProfiles(topics).map((topic) => ({
    ...topic,
    terms: Array.from(new Set([topic.name, ...topic.terms])).slice(0, 10),
    usNewsTerms: Array.from(new Set([topic.name, ...topic.usNewsTerms])).slice(0, 8),
  }));
}

function topicPrompt(
  mode: "generate" | "refine",
  topics: TopicProfile[],
  items: ReturnType<typeof compactItem>[],
  instructions: string,
) {
  return `You are designing research search topics for a biomedical and engineering research briefing platform.

Goal:
- Create PubMed and Google News search topic profiles.
- Topics should support later research planning, project progress tracking, result organization, and manuscript writing.
- Keep topics concrete enough for weekly/twice-weekly monitoring.
- PubMed should focus on original articles and reviews, not editorials, letters, comments, or news.

Mode:
${mode === "generate" ? "Generate improved research topics from the recent search results and current topics." : "Refine the researcher-edited draft while preserving the researcher's intent."}

Researcher instructions:
${instructions || "(none)"}

Current or researcher-edited topics:
${JSON.stringify(topics, null, 2)}

Recent search result signals:
${JSON.stringify(items, null, 2)}

Return only JSON with this shape:
{
  "topics": [
    {
      "slug": "lowercase-kebab-case",
      "name": "English topic name",
      "description": "One concise sentence explaining the scope.",
      "terms": ["English PubMed Title/Abstract term"],
      "meshTerms": ["PubMed MeSH term"],
      "koreanTerms": ["Korean search term"],
      "highImpactJournals": ["Nature Medicine"],
      "usNewsTerms": ["English news search term"],
      "krNewsTerms": ["Korean news search term"]
    }
  ]
}

Return 3 to 5 topics unless the researcher clearly requested another number.`;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid AI topic request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const currentTopics = parsed.data.topics
    ? normalizeTopicProfiles(parsed.data.topics)
    : await getEnabledTopics();
  const latestReport = await getLatestReport();
  const recentItems = latestReport?.items.slice(0, 40).map(compactItem) ?? [];

  if (!config.openaiApiKey) {
    return NextResponse.json({
      ok: true,
      model: null,
      topics: fallbackTopics(currentTopics),
      note: "OPENAI_API_KEY is not configured; returned a normalized draft instead.",
    });
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      input: topicPrompt(
        parsed.data.mode,
        currentTopics,
        recentItems,
        parsed.data.instructions ?? "",
      ),
    });
    const body = JSON.parse(extractJson(response.output_text)) as { topics?: TopicProfile[] };
    return NextResponse.json({
      ok: true,
      model: config.openaiModel,
      topics: normalizeTopicProfiles(body.topics ?? currentTopics),
    });
  } catch (error) {
    console.error("AI topic generation failed.", error);
    return NextResponse.json(
      {
        error: "AI topic generation failed.",
        topics: fallbackTopics(currentTopics),
      },
      { status: 502 },
    );
  }
}

