import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeGrantCandidateRfp,
  listGrantCandidates,
  removeGrantCandidate,
  saveGrantCandidate,
} from "@/lib/grant-candidates";
import { grantStorageErrorDetails } from "@/lib/grant-storage";
import type { GrantDocumentKind, GrantDocumentLink, GrantEntityType, GrantOpportunity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entityValues = ["school", "hospital", "company", "graduate", "postdoc"] as const;
const statusValues = ["open", "candidate", "needs_review"] as const;

const sourceGroupSchema = z.enum(["central", "regional-regulatory", "investment", "global-research", "trainee-fellowship"]);

const opportunitySchema = z.object({
  id: z.unknown().optional(),
  source: z.unknown().optional(),
  title: z.unknown().optional(),
  url: z.unknown().optional(),
  ministry: z.unknown().optional(),
  agency: z.unknown().optional(),
  noticeNumber: z.unknown().optional(),
  announcedAt: z.unknown().optional(),
  applicationStart: z.unknown().optional(),
  applicationEnd: z.unknown().optional(),
  dDay: z.unknown().optional(),
  status: z.unknown().optional(),
  statusLabel: z.unknown().optional(),
  solicitationType: z.unknown().optional(),
  topicMatches: z.unknown().optional(),
  expandedKeywords: z.unknown().optional(),
  relevanceScore: z.unknown().optional(),
  relevanceReason: z.unknown().optional(),
  eligibleEntities: z.unknown().optional(),
  eligibilityNote: z.unknown().optional(),
  actionItems: z.unknown().optional(),
  excerpt: z.unknown().optional(),
}).passthrough().transform((value, context) => normalizeOpportunityPayload(value, context));

const saveCandidateSchema = z.object({
  opportunity: opportunitySchema,
  sourceGroup: sourceGroupSchema,
  notes: z.string().optional(),
});

const updateCandidateSchema = z.object({
  id: z.string(),
  action: z.literal("analyze-rfp"),
});

const deleteCandidateSchema = z.object({
  id: z.string(),
  exclude: z.boolean().optional(),
});

function cleanText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/g, " ").trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).normalize("NFKC").replace(/\s+/g, " ").trim() || fallback;
}

function nullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function stringList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/)
      : [];
  return values.map((item) => cleanText(item)).filter(Boolean);
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizedStatus(value: unknown): GrantOpportunity["status"] {
  return statusValues.includes(value as GrantOpportunity["status"])
    ? (value as GrantOpportunity["status"])
    : "candidate";
}

function normalizedEntities(value: unknown): GrantEntityType[] {
  const entities = stringList(value).filter((item): item is GrantEntityType =>
    entityValues.includes(item as GrantEntityType),
  );
  return entities.length ? entities : ["school", "hospital", "company"];
}

function normalizedDocumentKind(value: unknown): GrantDocumentKind {
  return ["rfp", "notice", "page", "form", "unknown"].includes(value as GrantDocumentKind)
    ? (value as GrantDocumentKind)
    : "unknown";
}

function documentKindLabel(kind: GrantDocumentKind) {
  if (kind === "rfp") return "RFP/세부지원내용";
  if (kind === "notice") return "공고문/시행계획";
  if (kind === "form") return "서식/양식";
  if (kind === "page") return "상세페이지";
  return "첨부파일";
}

function normalizedDocumentLinks(value: unknown): GrantDocumentLink[] {
  if (!Array.isArray(value)) return [];
  const links: GrantDocumentLink[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item as Partial<GrantDocumentLink>;
    const fileName = cleanText(record.fileName);
    const url = cleanText(record.url);
    if (!fileName || !url) return;
    const kind = normalizedDocumentKind(record.kind);
    links.push({
      fileName,
      url,
      fileSize: numberOrNull(record.fileSize),
      kind,
      label: cleanText(record.label, documentKindLabel(kind)),
    });
  });
  return links;
}

function normalizedRfpPreview(value: unknown): GrantOpportunity["rfpPreview"] {
  if (!value || typeof value !== "object") return null;
  const item = value as NonNullable<GrantOpportunity["rfpPreview"]>;
  const fileName = cleanText(item.fileName);
  if (!fileName) return null;
  const documentKind = normalizedDocumentKind(item.documentKind);
  return {
    analyzedAt: cleanText(item.analyzedAt, new Date(0).toISOString()),
    fileName,
    fileType: cleanText(item.fileType, "unknown"),
    documentUrl: nullableText(item.documentUrl),
    documentLinks: normalizedDocumentLinks(item.documentLinks),
    documentKind,
    documentKindLabel: cleanText(item.documentKindLabel, documentKindLabel(documentKind)),
    fitSummary: cleanText(item.fitSummary),
    matchedKeywords: stringList(item.matchedKeywords),
    coreKeywords: stringList(item.coreKeywords),
    rfpFocus: stringList(item.rfpFocus),
    rfpSections: Array.isArray(item.rfpSections) ? item.rfpSections : [],
    researchPeriod: item.researchPeriod ?? { value: "확인 필요", evidence: null },
    funding: item.funding ?? { value: "확인 필요", evidence: null },
    mainResearchObjective: item.mainResearchObjective ?? { value: "확인 필요", evidence: null },
    goals: stringList(item.goals),
    threeBookFiveProjectRule: item.threeBookFiveProjectRule ?? { value: "확인 필요", evidence: null },
    deadlineSignals: stringList(item.deadlineSignals),
    documentSignals: stringList(item.documentSignals),
    recommendedActions: stringList(item.recommendedActions),
    concerns: stringList(item.concerns),
  };
}

function normalizeOpportunityPayload(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
): GrantOpportunity {
  const id = cleanText(value.id);
  const title = cleanText(value.title);
  const url = cleanText(value.url);

  if (!id && !title && !url) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one of opportunity.id, opportunity.title, or opportunity.url is required.",
    });
    return z.NEVER;
  }

  return {
    id: id || url || title,
    source: cleanText(value.source, "Unknown"),
    title: title || "Untitled opportunity",
    url,
    ministry: nullableText(value.ministry),
    agency: nullableText(value.agency),
    noticeNumber: nullableText(value.noticeNumber),
    announcedAt: nullableText(value.announcedAt),
    applicationStart: nullableText(value.applicationStart),
    applicationEnd: nullableText(value.applicationEnd),
    dDay: numberOrNull(value.dDay),
    status: normalizedStatus(value.status),
    statusLabel: cleanText(value.statusLabel, "candidate"),
    solicitationType: nullableText(value.solicitationType),
    topicMatches: stringList(value.topicMatches),
    expandedKeywords: stringList(value.expandedKeywords),
    relevanceScore: numberOrNull(value.relevanceScore) ?? 0,
    relevanceReason: cleanText(value.relevanceReason),
    eligibleEntities: normalizedEntities(value.eligibleEntities),
    eligibilityNote: cleanText(value.eligibilityNote),
    actionItems: stringList(value.actionItems),
    excerpt: nullableText(value.excerpt),
    rfpPreview: normalizedRfpPreview(value.rfpPreview),
    rfpPreviewError: nullableText(value.rfpPreviewError),
  };
}

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
    return NextResponse.json({ candidates: await listGrantCandidates() });
  } catch (error) {
    return storageErrorResponse(error, "지원후보과제 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  const parsed = saveCandidateSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid grant candidate payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const candidate = await saveGrantCandidate(parsed.data);
    return NextResponse.json({ candidate });
  } catch (error) {
    return storageErrorResponse(error, "지원후보과제 저장에 실패했습니다.");
  }
}

export async function PATCH(request: Request) {
  const parsed = updateCandidateSchema.safeParse(await requestJson(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid grant candidate update payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const candidate = await analyzeGrantCandidateRfp(parsed.data.id);
    if (!candidate) {
      return NextResponse.json({ error: "지원후보과제를 찾지 못했습니다." }, { status: 404 });
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    return storageErrorResponse(error, "RFP 분석 결과 저장에 실패했습니다.");
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const queryPayload =
    url.searchParams.has("id") || url.searchParams.has("exclude")
      ? {
          id: url.searchParams.get("id"),
          exclude: url.searchParams.has("exclude") ? url.searchParams.get("exclude") !== "false" : undefined,
        }
      : null;
  const parsed = deleteCandidateSchema.safeParse(queryPayload ?? (await requestJson(request)));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid grant candidate delete payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await removeGrantCandidate(parsed.data.id, parsed.data.exclude ?? true);
    if (!result) {
      return NextResponse.json({ error: "지원후보과제를 찾지 못했습니다." }, { status: 404 });
    }

    return NextResponse.json({
      removed: true,
      candidate: result.candidate,
      exclusionError: result.exclusionError,
      exclusionDetails: result.exclusionDetails,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "지원후보과제 배제에 실패했습니다.",
        details: grantStorageErrorDetails(error),
      },
      { status: 500 },
    );
  }
}
