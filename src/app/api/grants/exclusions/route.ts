import { NextResponse } from "next/server";
import { z } from "zod";
import { excludeGrantOpportunity, listGrantExclusions } from "@/lib/grant-exclusions";
import { grantStorageErrorDetails } from "@/lib/grant-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sourceGroupSchema = z.enum(["central", "regional-regulatory", "investment", "global-research", "trainee-fellowship"]);

const opportunitySchema = z.object({
  id: z.unknown().optional(),
  source: z.unknown().optional(),
  title: z.unknown().optional(),
  url: z.unknown().optional(),
}).passthrough();

const excludeSchema = z.object({
  sourceGroup: sourceGroupSchema,
  opportunity: opportunitySchema,
  reason: z.string().optional(),
}).refine(
  (value) =>
    ["id", "title", "url"].some((key) => {
      const candidate = value.opportunity[key as "id" | "title" | "url"];
      return typeof candidate === "string" ? candidate.trim().length > 0 : candidate !== null && candidate !== undefined;
    }),
  { message: "At least one of opportunity.id, opportunity.title, or opportunity.url is required.", path: ["opportunity"] },
);

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

export async function GET() {
  try {
    return NextResponse.json({ exclusions: await listGrantExclusions() });
  } catch (error) {
    return storageErrorResponse(error, "과제 배제 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const parsed = excludeSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "과제 배제 요청 형식이 올바르지 않습니다.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const exclusion = await excludeGrantOpportunity(parsed.data);
    return NextResponse.json({ exclusion });
  } catch (error) {
    return storageErrorResponse(error, "과제 배제에 실패했습니다.");
  }
}
