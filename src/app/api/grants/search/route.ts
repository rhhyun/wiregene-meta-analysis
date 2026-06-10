import { NextResponse } from "next/server";
import { z } from "zod";
import {
  defaultGrantTopics,
  grantSourceSummaries,
  searchGovernmentGrants,
} from "@/lib/government-grants";
import { grantStorageErrorDetails } from "@/lib/grant-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entitySchema = z.enum(["school", "hospital", "company", "graduate", "postdoc"]);
const sourceGroupSchema = z.enum(["central", "regional-regulatory", "investment", "global-research", "trainee-fellowship"]);
const stringListSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.split(/[\n,;]+/) : value),
  z.array(z.string()).optional(),
);

const searchSchema = z.object({
  topics: stringListSchema,
  extraKeywords: stringListSchema,
  institutionTypes: z.preprocess(
    (value) => (typeof value === "string" ? value.split(/[\n,;]+/) : value),
    z.array(entitySchema).optional(),
  ),
  includeExternalSources: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(80).optional(),
  sourceGroup: sourceGroupSchema.optional(),
});

function errorResponse(error: unknown, message: string) {
  return NextResponse.json({ error: message, details: grantStorageErrorDetails(error) }, { status: 500 });
}

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json({
    topics: defaultGrantTopics,
    expandedKeywords: [],
    institutionTypes: ["school", "hospital", "company"],
    sources: grantSourceSummaries(),
  });
}

export async function POST(request: Request) {
  const parsed = searchSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid government grant search options.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await searchGovernmentGrants(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "정부과제 검색에 실패했습니다.");
  }
}
