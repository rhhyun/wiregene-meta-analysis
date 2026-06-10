import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGrantKeywordSet } from "@/lib/government-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keywordSchema = z.object({
  keywords: z.preprocess(
    (value) => (typeof value === "string" ? value.split(/[\n,;]+/) : value),
    z.array(z.string()).optional(),
  ),
  extraKeywords: z.preprocess(
    (value) => (typeof value === "string" ? value.split(/[\n,;]+/) : value),
    z.array(z.string()).optional(),
  ),
});

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const parsed = keywordSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid keyword expansion payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const baseKeywords = (parsed.data.keywords ?? []).slice(0, 5);
  const expandedKeywords = buildGrantKeywordSet(baseKeywords, parsed.data.extraKeywords ?? []);
  return NextResponse.json({ baseKeywords, expandedKeywords });
}
