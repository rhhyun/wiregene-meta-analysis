import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { metaAiSettingsErrorDetails, resolveMetaOpenAIConfig } from "@/lib/meta-ai-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  sourceText: z.string().min(20).max(30000),
});

const draftSchema = z.object({
  title: z.string().optional(),
  researchQuestion: z.string().optional(),
  population: z.string().optional(),
  exposure: z.string().optional(),
  outcomes: z.string().optional(),
  databases: z.string().optional(),
  eligibility: z.string().optional(),
  searchBlocks: z.string().optional(),
  extractionPlan: z.string().optional(),
});

const responseSchema = z.object({
  draft: draftSchema,
  needsUserReview: z.array(z.string()).optional(),
});

type StudyPlanDraft = z.infer<typeof draftSchema>;

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "";
}

function nonEmptyLines(sourceText: string) {
  return sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function firstAfterLabel(lines: string[], labels: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = line.toLowerCase();
    if (!labels.some((label) => normalized.includes(label.toLowerCase()))) continue;

    const inlineValue = line.split(/[:：]/).slice(1).join(":").trim();
    if (inlineValue) return inlineValue;

    const next = lines[index + 1]?.trim();
    if (next && !next.endsWith(":")) return next;
  }

  return "";
}

function extractDatabaseCounts(sourceText: string) {
  const databaseNames = ["PubMed", "Scopus", "Web of Science", "WoS", "Cochrane", "EMBASE", "Embase"];
  const counts = new Map<string, string>();

  for (const database of databaseNames) {
    const escaped = database.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped}[^\\d\\n]{0,80}(\\d{1,6})`, "i");
    const match = sourceText.match(pattern);
    if (match?.[1]) {
      const canonical = database === "WoS" ? "Web of Science" : database.toUpperCase() === "EMBASE" ? "EMBASE" : database;
      counts.set(canonical, match[1]);
    }
  }

  return Array.from(counts.entries()).map(([database, count]) => `${database} ${count}`).join(", ");
}

function extractSearchBlocks(sourceText: string) {
  const lines = nonEmptyLines(sourceText);
  const searchLines = lines.filter((line) =>
    /(\bAND\b|\bOR\b|\bNOT\b|Title\/Abstract|TITLE-ABS-KEY|TS=|\bti,ab\b|\[Mesh\]|\[english\]|\bPY=)/i.test(line),
  );

  if (searchLines.length > 0) return searchLines.slice(0, 80).join("\n");

  const searchIndex = lines.findIndex((line) => /search|검색식|검색 전략/i.test(line));
  if (searchIndex >= 0) return lines.slice(searchIndex, searchIndex + 20).join("\n");

  return "";
}

function extractListSection(sourceText: string, includeTerms: string[], stopTerms: string[]) {
  const lines = nonEmptyLines(sourceText);
  const start = lines.findIndex((line) => includeTerms.some((term) => line.toLowerCase().includes(term.toLowerCase())));
  if (start < 0) return "";

  const output: string[] = [];
  for (const line of lines.slice(start, start + 30)) {
    if (output.length > 0 && stopTerms.some((term) => line.toLowerCase().includes(term.toLowerCase()))) break;
    output.push(line);
  }

  return output.join("\n");
}

function fallbackStudyPlan(sourceText: string) {
  const lines = nonEmptyLines(sourceText);
  const title =
    firstAfterLabel(lines, ["working title", "title", "가제", "제목"]) ||
    lines.find((line) => line.length > 25 && !/search|result|검색|결과/i.test(line)) ||
    "";
  const researchQuestion =
    firstAfterLabel(lines, ["research question", "핵심 질문", "질문", "objective", "목적"]) ||
    lines.find((line) => /whether|does|do |인가|하는가|높은가|차이가/i.test(line)) ||
    "";
  const databases = extractDatabaseCounts(sourceText) || "PubMed, Scopus, Web of Science, EMBASE, Cochrane";
  const eligibility =
    extractListSection(sourceText, ["include", "inclusion", "포함", "exclude", "exclusion", "제외"], [
      "analysis",
      "분석",
      "search",
      "검색",
      "schedule",
      "일정",
    ]) || "AI가 초기 기준을 추출하지 못했습니다. 포함/제외 기준을 직접 확인하세요.";

  const lower = sourceText.toLowerCase();
  const population = /musician|instrumentalist|orchestra|연주|음악가/.test(lower)
    ? "Instrumental musicians, orchestral musicians, music students, and specific instrumentalists"
    : "";
  const exposure = /asymmetry|비대칭|violin|viola|flute|cello|악기/.test(lower)
    ? "Instrument-imposed postural asymmetry or instrument group"
    : "";
  const outcomes = /pain|musculoskeletal|prmd|통증|근골격/.test(lower)
    ? "Region-specific and laterality-specific playing-related musculoskeletal pain prevalence"
    : "";
  const extractionPlan = [
    "Extract instrument/group denominator, body-region pain n/total, laterality if available, recall window, pain definition, study design, population type, and risk-of-bias fields.",
    "Before meta-analysis, run rapid extractability triage and mark no-denominator or no-region-outcome studies as not quantitatively usable.",
    "Use random-effects prevalence meta-analysis for extractable arm-based outcomes; treat ML/pattern analysis as exploratory.",
  ].join("\n");

  return {
    draft: {
      title,
      researchQuestion,
      population,
      exposure,
      outcomes,
      databases,
      eligibility,
      searchBlocks: extractSearchBlocks(sourceText),
      extractionPlan,
    } satisfies StudyPlanDraft,
    needsUserReview: [
      "AI/fallback 분석 결과를 저장 전 섹션별로 확인하세요.",
      "사용자가 직접 제공한 database count는 임의 변경하지 마세요.",
      "EMBASE 등 누락된 result count와 full-text denominator를 확인하세요.",
    ],
  };
}

function studyPlanPrompt(sourceText: string) {
  return `You are a systematic-review/meta-analysis planning assistant.

Task:
- Analyze and parse the user's free-form research idea into editable project fields.
- Preserve exact database names, search strings, and result counts provided by the user.
- Do not invent missing counts. Mark them as needing user review.
- If search strings are provided, keep them separated by database with labels like "PubMed query:", "Embase query:", "Scopus query:", "Web of Science query:", and "Cochrane query:".
- Never put explanatory text such as "Core search concept", "draft search", "optional supplementary block", or instructions inside an executable query.
- Do not reuse a PubMed query for Embase, Scopus, Web of Science, or Cochrane. If a database-specific executable query is missing, say that it requires user review instead of fabricating it.
- The user will manually edit and approve the draft before saving.

Return only JSON with this shape:
{
  "draft": {
    "title": "",
    "researchQuestion": "",
    "population": "",
    "exposure": "",
    "outcomes": "",
    "databases": "",
    "eligibility": "",
    "searchBlocks": "",
    "extractionPlan": ""
  },
  "needsUserReview": ["field or issue needing PI confirmation"]
}

User input:
${sourceText}`;
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "구상내용을 20자 이상 입력한 뒤 AI 분석을 실행하세요.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const fallback = fallbackStudyPlan(parsed.data.sourceText);

  let aiConfig: Awaited<ReturnType<typeof resolveMetaOpenAIConfig>>;
  try {
    aiConfig = await resolveMetaOpenAIConfig();
  } catch (error) {
    console.error("Meta AI settings could not be resolved; using fallback parser.", error);
    return NextResponse.json({
      ok: true,
      model: null,
      draft: fallback.draft,
      needsUserReview: [
        "AI 평가 설정 저장소를 읽지 못해 규칙 기반 parsing 결과를 사용했습니다.",
        ...fallback.needsUserReview,
      ],
      note: "AI 평가 설정 저장소를 읽지 못해 fallback parser 결과를 반환했습니다.",
      settingsError: metaAiSettingsErrorDetails(error),
    });
  }

  if (!aiConfig.enabled) {
    return NextResponse.json({
      ok: true,
      model: null,
      draft: fallback.draft,
      needsUserReview: fallback.needsUserReview,
      apiKeySource: aiConfig.source,
      note:
        aiConfig.source === "missing"
          ? "저장된 OpenAI API key와 서버 환경변수 key를 찾지 못해 규칙 기반 parsing 결과를 반환했습니다."
          : "AI 평가 설정이 비활성화되어 규칙 기반 parsing 결과를 반환했습니다.",
    });
  }

  try {
    const openai = new OpenAI({ apiKey: aiConfig.apiKey });
    const response = await openai.responses.create({
      model: aiConfig.modelName,
      input: studyPlanPrompt(parsed.data.sourceText),
    });
    const body = responseSchema.parse(JSON.parse(extractJson(response.output_text)));

    return NextResponse.json({
      ok: true,
      model: aiConfig.modelName,
      apiKeySource: aiConfig.source,
      draft: { ...fallback.draft, ...body.draft },
      needsUserReview: body.needsUserReview?.length ? body.needsUserReview : fallback.needsUserReview,
    });
  } catch (error) {
    console.error("Meta study-plan AI analysis failed; using fallback parser.", error);
    return NextResponse.json({
      ok: true,
      model: null,
      attemptedModel: aiConfig.modelName,
      apiKeySource: aiConfig.source,
      draft: fallback.draft,
      needsUserReview: [
        "OpenAI 분석에 실패해 규칙 기반 parsing 결과를 사용했습니다.",
        ...fallback.needsUserReview,
      ],
      note: "OpenAI 분석 실패. fallback parser 결과를 반환했습니다.",
    });
  }
}
