import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getGrantKeywordPreset,
  listGrantKeywordPresets,
  normalizeGrantBaseKeywords,
  saveGrantKeywordPreset,
} from "@/lib/grant-keyword-presets";
import { grantStorageErrorDetails } from "@/lib/grant-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sourceGroupSchema = z.enum(["central", "regional-regulatory", "investment", "global-research", "trainee-fellowship"]);

const keywordListSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.split(/[\n,;]+/) : value),
  z.array(z.string()).optional(),
);

const saveSchema = z
  .object({
    sourceGroup: sourceGroupSchema,
    baseKeywords: keywordListSchema,
    keywords: keywordListSchema,
  })
  .transform((value) => ({
    sourceGroup: value.sourceGroup,
    baseKeywords: value.baseKeywords ?? value.keywords ?? [],
  }));

function storageErrorResponse(error: unknown, message: string) {
  return NextResponse.json({ error: message, details: grantStorageErrorDetails(error) }, { status: 500 });
}

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const sourceGroup = new URL(request.url).searchParams.get("sourceGroup");
  if (!sourceGroup) {
    try {
      return NextResponse.json({ presets: await listGrantKeywordPresets() });
    } catch (error) {
      return storageErrorResponse(error, "기본 키워드를 불러오지 못했습니다.");
    }
  }

  const parsed = sourceGroupSchema.safeParse(sourceGroup);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid grant source group." }, { status: 400 });
  }

  try {
    return NextResponse.json({ preset: await getGrantKeywordPreset(parsed.data) });
  } catch (error) {
    return storageErrorResponse(error, "기본 키워드를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const parsed = saveSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid keyword preset payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const baseKeywords = normalizeGrantBaseKeywords(parsed.data.baseKeywords);
  if (baseKeywords.length === 0) {
    return NextResponse.json({ error: "At least one base keyword is required." }, { status: 400 });
  }

  try {
    const preset = await saveGrantKeywordPreset(parsed.data.sourceGroup, baseKeywords);
    return NextResponse.json({ preset });
  } catch (error) {
    return storageErrorResponse(error, "기본 키워드 저장에 실패했습니다.");
  }
}
