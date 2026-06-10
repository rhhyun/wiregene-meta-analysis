import { NextResponse } from "next/server";
import { z } from "zod";
import { findThesisKeyJournalCandidates } from "@/lib/thesis-key-journals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keyJournalSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.string().min(2).max(40),
  targetJournal: z.string().max(300).optional(),
  centralClaim: z.string().max(1000).optional(),
  nextAction: z.string().max(1000).optional(),
  researchContext: z.string().max(5000).optional(),
});

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const parsed = keyJournalSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid key journal search options.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await findThesisKeyJournalCandidates(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Key journal search failed." },
      { status: 502 },
    );
  }
}
