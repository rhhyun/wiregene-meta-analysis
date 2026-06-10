import OpenAI from "openai";
import JSZip from "jszip";
import { config } from "./config";
import { stripTags } from "./format";
import type {
  GrantDocumentKind,
  GrantDocumentLink,
  GrantEntityType,
  GrantRfpDecisionSummary,
  GrantRfpEligibilityDecision,
  GrantRfpEligibilitySignals,
  GrantRfpFileType,
  GrantRfpSection,
  GrantRfpUploadAnalysis,
} from "./types";

export type GrantRfpAnalysisInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  documentUrl?: string | null;
  contextText?: string | null;
  topics?: string[];
  extraKeywords?: string[];
  useAi?: boolean;
};

type AiRfpAnalysis = Partial<
  Pick<
    GrantRfpUploadAnalysis,
    | "titleGuess"
    | "fitScore"
    | "fitSummary"
    | "matchedKeywords"
    | "coreKeywords"
    | "rfpSections"
    | "rfpFocus"
    | "eligibilitySignals"
    | "deadlineSignals"
    | "documentSignals"
    | "concerns"
    | "recommendedActions"
    | "decisionSummary"
  >
>;

const maxAnalysisCharacters = 60_000;

const cleanDefaultKeywords = [
  "spinal cord injury",
  "SCI",
  "척수손상",
  "신경재활",
  "재활",
  "재활로봇",
  "웨어러블",
  "보조기기",
  "의료기기",
  "디지털치료기기",
  "의료 AI",
  "임상시험",
  "IRB",
  "환자",
  "병원",
  "의료데이터",
  "근감소증",
  "노쇠",
  "BCI",
  "neuromodulation",
  "neurorehabilitation",
  "clinical translation",
  "postdoctoral fellowship",
  "predoctoral fellowship",
  "startup",
  "TIPS",
];

const entityPatterns: Record<GrantEntityType, RegExp[]> = {
  school: [
    /대학|학교|산학협력단|비영리|government-funded research institute/i,
    /university|college|academic|principal investigator|research institution|non-profit|nonprofit/i,
  ],
  hospital: [
    /병원|의료기관|임상시험|환자|의사|IRB|기관생명윤리|의료데이터/i,
    /hospital|clinic|clinical|patient|medical center|IRB|human subject/i,
  ],
  company: [
    /기업|중소기업|창업기업|벤처|스타트업|사업화|제품화|투자|TIPS|팁스|기술사업화/i,
    /company|industry|startup|commercial|accelerator|investment|SME|venture/i,
  ],
  graduate: [
    /대학원생|석사|박사과정|석박통합|학문후속세대|연구장려금|predoctoral|PhD student|graduate student|doctoral/i,
  ],
  postdoc: [
    /포닥|박사후|박사후연구원|신진연구자|세종과학펠로우십|postdoc|postdoctoral|early career|fellowship/i,
  ],
};

const documentPatterns = [
  /연구개발계획서|연구계획서|사업계획서|제안서|RFP|제안요구서/gi,
  /신청서|개인정보|동의서|확약서|참여의사|기관장|공문|사업자등록증/gi,
  /예산서|현금|현물|간접비|인건비|참여율|연구비/gi,
  /CV|이력서|논문목록|추천서|성적증명|학위증명|재학증명|졸업증명/gi,
  /IRB|임상시험계획|의료기기|인허가|GMP|개인정보보호|데이터관리/gi,
  /LOI|Letter of Intent|Executive Summary|Full Proposal|Biosketch|Budget/gi,
];

const rfpFocusPatterns = [
  /제안요구서|RFP|연구개발내용|지원분야|품목|기술개발|최종목표|성과목표|마일스톤/gi,
  /지원대상|신청자격|주관기관|공동연구|참여기관|위탁기관/gi,
  /접수기간|마감|제출기한|평가절차|선정평가|협약|사업기간|지원규모|지원금/gi,
  /spinal cord injury|SCI|neurorehabilitation|clinical trial|eligibility|deadline|proposal/gi,
];

export function detectGrantRfpFileType(fileName: string, mimeType = ""): GrantRfpFileType {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) return "pdf";
  if (lowerName.endsWith(".hwpx") || lowerMime.includes("hwpx")) return "hwpx";
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerMime.startsWith("text/")) {
    return "text";
  }
  return "unsupported";
}

export async function analyzeGrantRfpUpload(input: GrantRfpAnalysisInput): Promise<GrantRfpUploadAnalysis> {
  const fileType = detectGrantRfpFileType(input.fileName, input.mimeType);
  const topics = normalizeList(input.topics);
  const extraKeywords = normalizeList(input.extraKeywords);
  const keywords = buildKeywordSet(topics, extraKeywords);
  const extractedText = await extractGrantRfpText(input.buffer, input.fileName, input.mimeType);
  const normalizedText = normalizeExtractedText(
    [input.contextText, extractedText].filter(Boolean).join("\n\n--- RFP_ATTACHMENT_TEXT ---\n\n"),
  );
  const truncatedText = normalizedText.slice(0, maxAnalysisCharacters);
  const base = fallbackAnalyzeText({
    fileName: input.fileName,
    fileType,
    documentUrl: input.documentUrl ?? null,
    text: normalizedText,
    analysisText: truncatedText,
    topics,
    extraKeywords,
    keywords,
  });

  if (input.useAi === false || !config.openaiApiKey || normalizedText.length < 80) return base;

  const ai = await analyzeWithOpenAI({
    fileName: input.fileName,
    fileType,
    topics,
    extraKeywords,
    text: truncatedText,
    fallback: base,
  });

  if (!ai) return base;

  const aiMatchedKeywords = normalizeList(ai.matchedKeywords).slice(0, 20);
  const aiCoreKeywords = normalizeList(ai.coreKeywords).slice(0, 16);
  const aiRfpFocus = normalizeList(ai.rfpFocus).slice(0, 10);
  const aiDeadlineSignals = normalizeList(ai.deadlineSignals).slice(0, 10);
  const aiDocumentSignals = normalizeList(ai.documentSignals).slice(0, 16);
  const aiConcerns = normalizeList(ai.concerns).slice(0, 8);
  const aiRecommendedActions = normalizeList(ai.recommendedActions).slice(0, 8);
  const aiDecisionSummary = normalizeDecisionSummary(ai.decisionSummary, base.decisionSummary);

  return {
    ...base,
    titleGuess: typeof ai.titleGuess === "string" ? ai.titleGuess : base.titleGuess,
    fitScore: clampScore(ai.fitScore, base.fitScore),
    fitSummary: typeof ai.fitSummary === "string" ? ai.fitSummary : base.fitSummary,
    matchedKeywords: aiMatchedKeywords.length > 0 ? aiMatchedKeywords : base.matchedKeywords,
    coreKeywords: aiCoreKeywords.length > 0 ? aiCoreKeywords : base.coreKeywords,
    rfpSections: normalizeSections(ai.rfpSections) || base.rfpSections,
    rfpFocus: aiRfpFocus.length > 0 ? aiRfpFocus : base.rfpFocus,
    eligibilitySignals: normalizeEligibilitySignals(ai.eligibilitySignals) || base.eligibilitySignals,
    deadlineSignals: aiDeadlineSignals.length > 0 ? aiDeadlineSignals : base.deadlineSignals,
    documentSignals: aiDocumentSignals.length > 0 ? aiDocumentSignals : base.documentSignals,
    concerns: aiConcerns.length > 0 ? aiConcerns : base.concerns,
    recommendedActions: aiRecommendedActions.length > 0 ? aiRecommendedActions : base.recommendedActions,
    decisionSummary: aiDecisionSummary,
  };
}

export async function fetchGrantRfpDocument(documentUrl: string) {
  const parsed = new URL(documentUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("PDF/HWPX 원문 URL은 http 또는 https 주소만 사용할 수 있습니다.");
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      Accept:
        "application/pdf, application/octet-stream, application/zip, text/plain, text/html;q=0.8, */*;q=0.5",
      "User-Agent": "research-briefing-platform/1.4 grant-rfp-analyzer",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(18_000),
  });

  if (!response.ok) {
    throw new Error(`원문 다운로드가 차단되었거나 실패했습니다. HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";
  const disposition = response.headers.get("content-disposition") ?? "";
  const buffer = Buffer.from(arrayBuffer);
  const fileName =
    fileNameFromContentDisposition(disposition) ??
    safeDecodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "grant-rfp-document");

  if (isHtmlResponse(buffer, contentType, fileName)) {
    const html = buffer.toString("utf8");
    const attachments = parseIrisAttachments(html, parsed);
    const selected = chooseBestGrantAttachment(attachments);
    if (selected) {
      const cookie = responseCookieHeader(response.headers);
      const attachmentResponse = await fetch(selected.url, {
        headers: {
          Accept: "application/pdf, application/octet-stream, application/zip, */*;q=0.5",
          Referer: parsed.toString(),
          "User-Agent": "research-briefing-platform/1.4 grant-rfp-analyzer",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(18_000),
      });
      if (attachmentResponse.ok) {
        const attachmentType = attachmentResponse.headers.get("content-type") ?? "";
        return {
          buffer: Buffer.from(await attachmentResponse.arrayBuffer()),
          fileName: selected.fileName,
          mimeType: attachmentType,
          documentUrl: selected.url,
          documentLinks: attachments,
          contextText: htmlToPlainText(extractMainHtml(html)).slice(0, 20_000),
        };
      }
    }

    return {
      buffer: Buffer.from(htmlToPlainText(extractMainHtml(html)), "utf8"),
      fileName: pageTextFileName(parsed, fileName),
      mimeType: "text/plain",
      documentUrl: parsed.toString(),
      documentLinks: attachments,
    };
  }

  return {
    buffer,
    fileName,
    mimeType: contentType,
    documentUrl: parsed.toString(),
    documentLinks: [],
  };
}

async function extractGrantRfpText(buffer: Buffer, fileName: string, mimeType = "") {
  const fileType = detectGrantRfpFileType(fileName, mimeType);
  if (fileType === "pdf") return extractPdfText(buffer);
  if (fileType === "hwpx") return extractHwpxText(buffer);
  if (fileType === "text") return buffer.toString("utf8");
  throw new Error("지원하지 않는 원문 형식입니다. PDF, HWPX, TXT 파일을 업로드해 주세요.");
}

async function extractPdfText(buffer: Buffer) {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: 80 });
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function extractHwpxText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xmlFiles = Object.values(zip.files)
    .filter((file) => !file.dir && file.name.toLowerCase().endsWith(".xml"))
    .sort((a, b) => hwpxFilePriority(a.name) - hwpxFilePriority(b.name));

  if (xmlFiles.length === 0) {
    throw new Error("HWPX 내부 XML 본문을 찾지 못했습니다.");
  }

  const chunks: string[] = [];
  for (const file of xmlFiles.slice(0, 120)) {
    const xml = await file.async("text");
    const text = xmlToPlainText(xml);
    if (text.length > 20) chunks.push(text);
  }

  return chunks.join("\n");
}

function hwpxFilePriority(name: string) {
  if (/contents\/section\d+\.xml/i.test(name)) return 0;
  if (/contents\//i.test(name)) return 1;
  if (/preview/i.test(name)) return 2;
  return 3;
}

function xmlToPlainText(xml: string) {
  const withBreaks = xml
    .replace(/<hp:(?:p|lineBreak|br)[^>]*>/gi, "\n")
    .replace(/<\/hp:p>/gi, "\n")
    .replace(/<[^>]+text="([^"]+)"[^>]*>/gi, " $1 ");
  return decodeXmlEntities(stripTags(withBreaks));
}

function fallbackAnalyzeText({
  fileName,
  fileType,
  documentUrl,
  text,
  analysisText,
  topics,
  extraKeywords,
  keywords,
}: {
  fileName: string;
  fileType: GrantRfpFileType;
  documentUrl: string | null;
  text: string;
  analysisText: string;
  topics: string[];
  extraKeywords: string[];
  keywords: string[];
}): GrantRfpUploadAnalysis {
  const matchedKeywords = matchKeywords(text, keywords);
  const coreKeywords = extractCoreKeywords(analysisText, matchedKeywords);
  const rfpSections = extractEvidenceSections(analysisText, keywords);
  const eligibilitySignals = buildEligibilitySignals(analysisText);
  const deadlineSignals = extractDeadlineSignals(analysisText);
  const documentSignals = extractDocumentSignals(analysisText);
  const rfpFocus = extractFocusSignals(analysisText);
  const decisionSummary = buildDecisionSummary(analysisText, coreKeywords, eligibilitySignals, rfpFocus, rfpSections);
  const concerns = buildConcerns(text, matchedKeywords, deadlineSignals, documentSignals, eligibilitySignals);
  const fitScore = scoreFit({
    matchedKeywords,
    rfpSections,
    deadlineSignals,
    documentSignals,
    eligibilitySignals,
    textLength: text.length,
  });

  return {
    fileName,
    fileType,
    documentUrl,
    extractedTextLength: text.length,
    truncated: text.length > maxAnalysisCharacters,
    analyzedAt: new Date().toISOString(),
    titleGuess: guessTitle(analysisText),
    topics,
    extraKeywords,
    fitScore,
    fitSummary: buildFitSummary(fitScore, matchedKeywords, deadlineSignals, documentSignals),
    matchedKeywords,
    coreKeywords,
    rfpSections,
    rfpFocus,
    eligibilitySignals,
    deadlineSignals,
    documentSignals,
    concerns,
    recommendedActions: buildRecommendedActions(fitScore, deadlineSignals, documentSignals, eligibilitySignals),
    decisionSummary,
  };
}

async function analyzeWithOpenAI({
  fileName,
  fileType,
  topics,
  extraKeywords,
  text,
  fallback,
}: {
  fileName: string;
  fileType: GrantRfpFileType;
  topics: string[];
  extraKeywords: string[];
  text: string;
  fallback: GrantRfpUploadAnalysis;
}) {
  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      input: `You are a Korean research grant RFP analyst for Ajou University, Ajou University Hospital, and Wiregen.

Analyze the uploaded grant notice/RFP text. Answer only with a JSON object. Do not invent details that are not supported by the text.

Analysis goals:
- Decide whether the RFP fits the research themes.
- Extract exact practical signals for eligibility, deadlines, required documents, and RFP scope.
- Separate supportability for university, hospital, company, graduate students, and postdocs.
- Write all narrative fields in Korean.
- Keep excerpts short and evidence-like.

Schema:
{
  "titleGuess": "string or null",
  "fitScore": 0,
  "fitSummary": "Korean 2-3 sentence summary",
  "matchedKeywords": ["keyword"],
  "coreKeywords": ["important RFP/domain keyword, not necessarily from user keywords"],
  "rfpSections": [{"label":"핵심 RFP 근거","excerpt":"short excerpt"}],
  "rfpFocus": ["RFP scope or research objective signal"],
  "eligibilitySignals": {
    "school": ["Ajou University supportability evidence"],
    "hospital": ["Ajou Hospital supportability evidence"],
    "company": ["Wiregen/company supportability evidence"],
    "graduate": ["graduate student evidence"],
    "postdoc": ["postdoc evidence"]
  },
  "deadlineSignals": ["deadline or schedule signal"],
  "documentSignals": ["required document signal"],
  "concerns": ["risk or missing information"],
  "recommendedActions": ["next action"],
  "decisionSummary": {
    "coreKeywords": ["one-line keyword list"],
    "researchPeriod": {"value":"research/project period or 확인 필요","evidence":"short source phrase or null"},
    "funding": {"value":"funding amount/support scale or 확인 필요","evidence":"short source phrase or null"},
    "mainResearchObjective": {"value":"main objective in one Korean sentence or 확인 필요","evidence":"short source phrase or null"},
    "goals": ["specific target/output/milestone"],
    "threeBookFiveProjectRule": {"value":"3책5공/participation limit status or 원문 확인 필요","evidence":"short source phrase or null"},
    "entityEligibility": {
      "school": {"decision":"eligible|possible|unclear|ineligible","label":"학교 주관 가능/확인 필요/etc","evidence":"short source phrase or null","action":"next check"},
      "hospital": {"decision":"eligible|possible|unclear|ineligible","label":"병원 주관 가능/확인 필요/etc","evidence":"short source phrase or null","action":"next check"},
      "company": {"decision":"eligible|possible|unclear|ineligible","label":"회사 주관 가능/확인 필요/etc","evidence":"short source phrase or null","action":"next check"},
      "graduate": {"decision":"eligible|possible|unclear|ineligible","label":"학생 지원 가능/확인 필요/etc","evidence":"short source phrase or null","action":"next check"},
      "postdoc": {"decision":"eligible|possible|unclear|ineligible","label":"포닥 지원 가능/확인 필요/etc","evidence":"short source phrase or null","action":"next check"}
    }
  }
}

File: ${fileName}
File type: ${fileType}
Research topics: ${JSON.stringify(topics)}
Extra keywords: ${JSON.stringify(extraKeywords)}
Fallback signals: ${JSON.stringify({
  matchedKeywords: fallback.matchedKeywords,
  deadlineSignals: fallback.deadlineSignals,
  documentSignals: fallback.documentSignals,
}, null, 2)}

RFP text:
${text}`,
    });
    return JSON.parse(extractJson(response.output_text)) as AiRfpAnalysis;
  } catch (error) {
    console.error("OpenAI RFP analysis failed; using fallback analysis.", error);
    return null;
  }
}

function buildKeywordSet(topics: string[], extraKeywords: string[]) {
  const values = [...topics, ...extraKeywords, ...cleanDefaultKeywords];
  return normalizeList(values.flatMap(expandKeyword));
}

function expandKeyword(value: string) {
  const lower = value.toLowerCase();
  const expanded = [value];
  if (/spinal|sci|척수/.test(lower)) {
    expanded.push("척수손상", "척수 손상", "신경재생", "neural repair", "functional recovery");
  }
  if (/rehab|재활|robot|로봇/.test(lower)) {
    expanded.push("신경재활", "재활로봇", "보행", "운동기능", "assistive technology");
  }
  if (/의료기기|device|digital|ai|데이터/.test(lower)) {
    expanded.push("의료기기", "디지털치료기기", "의료 AI", "임상시험", "인허가");
  }
  if (/graduate|postdoc|석박|박사|포닥|fellow/.test(lower)) {
    expanded.push("대학원생", "석박통합", "박사과정", "포닥", "박사후연구원", "fellowship");
  }
  return expanded;
}

function matchKeywords(text: string, keywords: string[]) {
  const normalizedText = normalizeForSearch(text);
  return keywords
    .filter((keyword) => includesLoose(normalizedText, keyword))
    .slice(0, 24);
}

function extractCoreKeywords(text: string, matchedKeywords: string[]) {
  const candidates = [
    "RFP",
    "과제제안요구서",
    "지원목적",
    "지원대상",
    "주관연구개발기관",
    "공동연구개발기관",
    "연구책임자",
    "유치후보 연구자",
    "박사급 인재",
    "AI",
    "빅데이터",
    "첨단바이오",
    "바이오헬스 기업",
    "임상시험",
    "IRB",
    "사업화",
    "특허",
    "시제품",
    "성과목표",
    "민간부담금",
    "제출서류",
    "접수기간",
    "연구개발계획서",
    "spinal cord injury",
    "neurorehabilitation",
    "clinical trial",
    "fellowship",
    "postdoctoral",
  ];
  const normalizedText = normalizeForSearch(text);
  const fromDocument = candidates.filter((keyword) => includesLoose(normalizedText, keyword));
  return normalizeList([...fromDocument, ...matchedKeywords]).slice(0, 16);
}

function buildDecisionSummary(
  text: string,
  coreKeywords: string[],
  eligibilitySignals: GrantRfpEligibilitySignals,
  rfpFocus: string[],
  rfpSections: GrantRfpSection[],
): GrantRfpDecisionSummary {
  return {
    coreKeywords: coreKeywords.slice(0, 18),
    researchPeriod: extractResearchPeriod(text),
    funding: extractFunding(text),
    mainResearchObjective: extractMainResearchObjective(text, rfpFocus, rfpSections),
    goals: extractGoals(text, rfpFocus, rfpSections),
    threeBookFiveProjectRule: extractThreeBookFiveProjectRule(text),
    entityEligibility: {
      school: decideEntityEligibility("school", text, eligibilitySignals.school),
      hospital: decideEntityEligibility("hospital", text, eligibilitySignals.hospital),
      company: decideEntityEligibility("company", text, eligibilitySignals.company),
      graduate: decideEntityEligibility("graduate", text, eligibilitySignals.graduate),
      postdoc: decideEntityEligibility("postdoc", text, eligibilitySignals.postdoc),
    },
  };
}

function fact(value: string, evidence: string | null): { value: string; evidence: string | null } {
  return {
    value: conciseValue(value),
    evidence: evidence ? conciseEvidence(evidence) : null,
  };
}

function extractResearchPeriod(text: string) {
  const supportBlock = excerptAroundPattern(text, /지원규모|지원기간|연구개발기간/gi);
  if (supportBlock) {
    const dateRange = pickDateRange(supportBlock);
    if (dateRange) return fact(dateRange, supportBlock);
    const value = pickRegexValue(supportBlock, /\d+\s*년\s*이내(?:\s*\(\d+\s*개월\s*이내\))?/);
    if (value) return fact(value, supportBlock);
  }

  const evidence =
    excerptAroundPattern(
      text,
      /연구개발기간|연구기간|사업기간|지원기간|수행기간|총\s*연구기간|project period|award period|duration/gi,
    ) ?? null;
  if (!evidence) return fact("원문 확인 필요", null);
  const value =
    pickDateRange(evidence) ??
    pickRegexValue(evidence, /((?:[1-9]\d?)\s*(?:년|개월|months?|years?))(?:\s*이내)?/i) ??
    "원문 확인 필요";
  return fact(value, evidence);
}

function extractFunding(text: string) {
  const supportBlock = excerptAroundPattern(text, /지원규모|연구개발비|지원금액|지원예산/gi);
  if (supportBlock) {
    const amounts = normalizeList(
      Array.from(supportBlock.matchAll(/[\d,]+(?:\.\d+)?\s*(?:억원|백만원|만원|원|USD|달러|KRW)/gi)).map(
        (match) => match[0],
      ),
    );
    if (amounts.length > 0) return fact(amounts.slice(0, 3).join(" / "), supportBlock);
  }

  const evidence =
    excerptAroundPattern(
      text,
      /정부지원연구개발비|연구비|지원규모|지원금|지원예산|과제당|총\s*사업비|총\s*연구비|민간부담금|funding|budget|award amount/gi,
    ) ?? null;
  if (!evidence) return fact("원문 확인 필요", null);
  const value =
    pickRegexValue(evidence, /(?:총|연|과제당|이내|내외)?\s*[\d,]+(?:\.\d+)?\s*(?:억원|백만원|만원|원|USD|달러|KRW)/i) ??
    "원문 확인 필요";
  return fact(value, evidence);
}

function extractMainResearchObjective(text: string, rfpFocus: string[], rfpSections: GrantRfpSection[]) {
  const purpose = extractBetweenLabels(text, /지원목적|사업목적|연구목적/gi, /지원대상|지원규모|성과목표|연구내용|추진내용/gi);
  if (purpose) return fact(purpose, purpose);

  const objectiveSection = rfpSections.find((section) => /목표|내용|RFP|제안/.test(section.label))?.excerpt;
  const evidence =
    excerptAroundPattern(text, /최종목표|연구목표|개발목표|핵심목표|사업목표|성과목표|연구개발내용|제안요구내용|objective|aim/gi) ??
    objectiveSection ??
    rfpFocus[0] ??
    null;
  if (!evidence) return fact("원문 확인 필요", null);
  return fact(removeLeadingLabel(evidence), evidence);
}

function extractGoals(text: string, rfpFocus: string[], rfpSections: GrantRfpSection[]) {
  const candidates = [
    ...extractNumberedGoalLines(text),
    ...rfpSections
      .filter((section) => /목표|성과|내용|RFP|제안/.test(section.label))
      .map((section) => removeLeadingLabel(section.excerpt)),
    ...rfpFocus.map(removeLeadingLabel),
  ];
  return normalizeList(candidates)
    .map(conciseValue)
    .map(stripGoalAdministrativeTail)
    .filter(isUsefulGoal)
    .slice(0, 5);
}

function extractNumberedGoalLines(text: string) {
  return text
    .split(/\n|(?=○|ㅇ|•|-|\d+[.)])/)
    .map((line) => line.trim().replace(/^[○ㅇ•\-\d.)\s]+/, ""))
    .filter((line) => /목표|개발|구축|검증|실증|평가|성과|시제품|임상|AI|데이터|바이오|재활|척수|신경/i.test(line))
    .slice(0, 12);
}

function isUsefulGoal(value: string) {
  return (
    value.length >= 16 &&
    value.length <= 220 &&
    /목표|개발|구축|검증|실증|평가|고도화|임상|데이터|AI|의료|재활|신경|척수|사업화|제품화/i.test(value) &&
    !/공고번호|공고명|공고일자|재공고|사업담당자|연락처|접수\s*개시|소관부처|전문기관|지원대상|신청자격|지원규모|지원기간|제출서류|관리번호|RFP\s*유형코드|TRL\s*단계|목적·내용\s*성과물|대상과제\s*공고|신규과제\s*공모|시행계획\s*공고/i.test(
      value,
    )
  );
}

function stripGoalAdministrativeTail(value: string) {
  const [goalPart] = value.split(
    /\s*(?:□|■|○|ㅇ|\*)\s*(?:사업기간|지원규모|지원기간|신청자격|지원대상|제출서류|접수기간|공고기간|사업비|정부출연금|평가절차)|\s+사업기간\/예산|\s+지원규모|\s+지원기간|\s+신청자격|\s+제출서류/i,
  );
  return conciseValue(goalPart || value);
}

function extractThreeBookFiveProjectRule(text: string) {
  const explicitEvidence =
    excerptAroundPattern(text, /3책\s*5공|3책5공|삼책오공/gi) ??
    excerptAroundPattern(text, /연구개발과제\s*수\s*제한|동시\s*수행|동시수행/gi);
  if (explicitEvidence) {
    if (/3책\s*5공.{0,30}■\s*Y\s*□\s*N|3책5공.{0,30}■\s*Y\s*□\s*N/i.test(explicitEvidence)) {
      return fact("적용", explicitEvidence);
    }
    if (/3책\s*5공.{0,30}□\s*Y\s*■\s*N|3책5공.{0,30}□\s*Y\s*■\s*N/i.test(explicitEvidence)) {
      return fact("미적용 또는 제외", explicitEvidence);
    }
    if (/미적용|적용\s*제외|제외\s*대상|해당\s*없음|□\s*Y\s*■\s*N|Y\s*□\s*N\s*■/i.test(explicitEvidence)) {
      return fact("미적용 또는 제외", explicitEvidence);
    }
    return fact("적용", explicitEvidence);
  }

  const genericEvidence =
    excerptAroundPattern(
      text,
      /참여율|수행\s*과제\s*수|과제\s*수\s*제한|연구개발과제\s*수/gi,
    ) ?? null;
  return fact("확인 필요", genericEvidence);
}

function pickDateRange(value: string) {
  return pickRegexValue(
    value,
    /(20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}\.?\s*(?:일)?\s*[~\-–]\s*20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}\.?\s*(?:일)?)/,
  );
}

function extractBetweenLabels(text: string, startPattern: RegExp, endPattern: RegExp) {
  startPattern.lastIndex = 0;
  const start = startPattern.exec(text);
  if (!start) return null;
  const startIndex = (start.index ?? 0) + start[0].length;
  const tail = text.slice(startIndex, startIndex + 1_000);
  endPattern.lastIndex = 0;
  const end = endPattern.exec(tail);
  const chunk = (end ? tail.slice(0, end.index) : tail).replace(/\s+/g, " ").trim();
  return chunk ? removeLeadingBullet(chunk).slice(0, 220) : null;
}

function removeLeadingBullet(value: string) {
  return value.replace(/^[○ㅇ•▶■◆\-\s:：]+/, "").replace(/[▶■◆\s]+$/, "");
}

function decideEntityEligibility(
  entity: GrantEntityType,
  text: string,
  signals: string[],
): {
  decision: GrantRfpEligibilityDecision;
  label: string;
  evidence: string | null;
  action: string;
} {
  const evidence = signals[0] ?? explicitEntityEvidence(entity, text);
  const nonProfitOnly = /비영리.{0,20}(기관|법인).{0,30}(한정|대상|주관)|영리.{0,20}(제외|불가)|기업.{0,20}(주관|참여).{0,20}불가/.test(text);
  const supportTarget = extractBetweenLabels(text, /지원대상|신청자격/gi, /지원규모|성과목표|연구내용|제출서류|접수/gi) ?? "";
  const companyOnly =
    /(중소기업|창업기업|기업).{0,30}(주관|단독|신청대상)|주관연구개발기관.{0,120}(중소기업|기업)/.test(
      text,
    ) || (/주관연구개발기관/.test(supportTarget) && /기업|중소기업|창업기업|바이오헬스 기업/.test(supportTarget));

  if (entity === "company" && nonProfitOnly && !evidence) {
    return {
      decision: "ineligible",
      label: "회사 주관 제한 가능",
      evidence: excerptAroundPattern(text, /비영리|영리|기업.{0,20}불가/gi),
      action: "기업은 공동·위탁·수요기관 참여 가능성만 별도 확인",
    };
  }

  if ((entity === "school" || entity === "hospital") && companyOnly && !hasExplicitEntityName(entity, evidence)) {
    return {
      decision: "possible",
      label: `${entityShortLabel(entity)} 주관 제한 가능`,
      evidence: excerptAroundPattern(text, /중소기업|창업기업|기업.{0,30}주관/gi),
      action: "주관은 기업 한정으로 보입니다. 공동·위탁·임상협력 가능성만 확인",
    };
  }

  if (evidence && isStrongEntityEvidence(entity, evidence)) {
    return {
      decision: "eligible",
      label: `${entityShortLabel(entity)} 주관/지원 가능`,
      evidence: conciseEvidence(evidence),
      action: "공고 원문의 신청자격 표에서 주관·공동·위탁 구분 확정",
    };
  }

  if (evidence) {
    return {
      decision: "possible",
      label: `${entityShortLabel(entity)} 참여 가능성 있음`,
      evidence: conciseEvidence(evidence),
      action: "주관기관 자격인지 공동/위탁 참여인지 원문 표 확인",
    };
  }

  return {
    decision: "unclear",
    label: `${entityShortLabel(entity)} 확인 필요`,
    evidence: null,
    action: "신청자격, 주관연구개발기관, 공동연구개발기관 항목 확인",
  };
}

function explicitEntityEvidence(entity: GrantEntityType, text: string) {
  const patterns: Record<GrantEntityType, RegExp> = {
    school: /대학|대학교|산학협력단|비영리기관|정부출연연구기관/gi,
    hospital: /병원|의료기관|임상시험|환자|IRB|기관생명윤리|의료데이터/gi,
    company: /기업|중소기업|중견기업|창업기업|벤처|기업부설연구소|산업체|사업화|제품화/gi,
    graduate: /대학원생|석사|박사과정|석박통합|연구장려금|학문후속/gi,
    postdoc: /포닥|박사후|박사후연구원|신진연구자|세종과학펠로우십|postdoctoral/gi,
  };
  return excerptAroundPattern(text, patterns[entity]);
}

function isStrongEntityEvidence(entity: GrantEntityType, evidence: string) {
  if (entity === "school") return /대학|대학교|산학협력단|비영리기관|정부출연연구기관/.test(evidence);
  if (entity === "hospital") return /병원|의료기관|임상시험|IRB|환자/.test(evidence);
  if (entity === "company") return /기업|중소기업|중견기업|창업기업|벤처|사업화|제품화/.test(evidence);
  if (entity === "graduate") return /대학원생|석사|박사과정|석박통합|연구장려금/.test(evidence);
  return /포닥|박사후|박사후연구원|신진연구자|postdoctoral/i.test(evidence);
}

function hasExplicitEntityName(entity: GrantEntityType, evidence: string | null | undefined) {
  if (!evidence) return false;
  if (entity === "school") return /대학|대학교|산학협력단|비영리기관|정부출연연구기관/.test(evidence);
  if (entity === "hospital") return /병원|의료기관|상급종합|임상시험기관/.test(evidence);
  if (entity === "company") return /기업|중소기업|중견기업|창업기업|벤처|기업부설연구소/.test(evidence);
  if (entity === "graduate") return /대학원생|석사|박사과정|석박통합/.test(evidence);
  return /포닥|박사후|박사후연구원|postdoctoral/i.test(evidence);
}

function entityShortLabel(entity: GrantEntityType) {
  if (entity === "school") return "학교";
  if (entity === "hospital") return "병원";
  if (entity === "graduate") return "학생";
  if (entity === "postdoc") return "포닥";
  return "회사";
}

function pickRegexValue(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  return match?.[0]?.trim() ?? null;
}

function removeLeadingLabel(value: string) {
  return value.replace(/^(최종목표|연구목표|개발목표|성과목표|연구개발내용|제안요구내용|지원내용)\s*[:：\-]?\s*/i, "");
}

function conciseValue(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function conciseEvidence(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 260);
}

function extractEvidenceSections(text: string, keywords: string[]): GrantRfpSection[] {
  const sections: GrantRfpSection[] = [];
  const patterns = [
    { label: "RFP/제안요구서", regex: /RFP|제안요구서|품목개요|연구개발내용|과제제안요구서/gi },
    { label: "연구목표", regex: /최종목표|연구목표|개발목표|성과목표|핵심성과|마일스톤/gi },
    { label: "지원대상", regex: /지원대상|신청자격|주관기관|공동연구|참여기관|지원자격/gi },
    { label: "접수/마감", regex: /접수기간|신청기간|마감|제출기한|deadline|due date/gi },
    { label: "제출서류", regex: /제출서류|첨부서류|연구개발계획서|사업계획서|구비서류/gi },
  ];

  for (const pattern of patterns) {
    const excerpt = excerptAroundPattern(text, pattern.regex);
    if (excerpt) sections.push({ label: pattern.label, excerpt });
  }

  for (const keyword of keywords.slice(0, 12)) {
    const excerpt = excerptAroundTerm(text, keyword);
    if (excerpt && !sections.some((section) => section.excerpt === excerpt)) {
      sections.push({ label: `주제 매칭: ${keyword}`, excerpt });
    }
    if (sections.length >= 8) break;
  }

  return sections.slice(0, 8);
}

function buildEligibilitySignals(text: string): GrantRfpEligibilitySignals {
  return Object.fromEntries(
    Object.entries(entityPatterns).map(([entity, patterns]) => {
      const signals = patterns
        .map((pattern) => excerptAroundPattern(text, pattern))
        .filter((value): value is string => Boolean(value))
        .slice(0, 4);
      return [entity, signals];
    }),
  ) as GrantRfpEligibilitySignals;
}

function extractDeadlineSignals(text: string) {
  const datePattern =
    /(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})[일]?(?:\s*(?:\([^)]+\))?)?(?:\s*(?:까지|마감|접수|제출|[0-2]?\d:[0-5]\d))?/g;
  const dates = Array.from(text.matchAll(datePattern))
    .map((match) => excerptAroundIndex(text, match.index ?? 0, 90, 140))
    .filter(Boolean);
  const deadlineWords = [
    excerptAroundPattern(text, /접수기간|신청기간|마감|제출기한|전산접수|온라인 접수|deadline|due date/gi),
  ].filter((value): value is string => Boolean(value));
  return normalizeList([...deadlineWords, ...dates]).slice(0, 10);
}

function extractDocumentSignals(text: string) {
  const signals: string[] = [];
  for (const pattern of documentPatterns) {
    const excerpt = excerptAroundPattern(text, pattern);
    if (excerpt) signals.push(excerpt);
  }
  return normalizeList(signals).slice(0, 14);
}

function extractFocusSignals(text: string) {
  const signals: string[] = [];
  for (const pattern of rfpFocusPatterns) {
    const excerpt = excerptAroundPattern(text, pattern);
    if (excerpt) signals.push(excerpt);
  }
  return normalizeList(signals).slice(0, 10);
}

function buildConcerns(
  text: string,
  matchedKeywords: string[],
  deadlineSignals: string[],
  documentSignals: string[],
  eligibilitySignals: GrantRfpEligibilitySignals,
) {
  const concerns: string[] = [];
  if (text.length < 600) concerns.push("추출된 본문이 짧아 RFP 전체 내용이 빠졌을 수 있습니다.");
  if (matchedKeywords.length === 0) concerns.push("현재 연구 주제 키워드와 직접 매칭되는 표현이 거의 없습니다.");
  if (deadlineSignals.length === 0) concerns.push("접수 마감일 또는 제출 일정 신호를 찾지 못했습니다.");
  if (documentSignals.length === 0) concerns.push("필수 제출서류 신호를 찾지 못했습니다.");
  if (eligibilitySignals.company.length === 0) concerns.push("기업 참여 가능 여부는 원문에서 추가 확인이 필요합니다.");
  if (eligibilitySignals.hospital.length === 0) concerns.push("병원/임상 참여 가능 여부는 원문에서 추가 확인이 필요합니다.");
  if (/로그인|권한|다운로드|첨부파일/i.test(text) && text.length < 1_500) {
    concerns.push("다운로드 안내나 목록 페이지만 추출된 것으로 보입니다. RFP 첨부파일을 직접 업로드해 주세요.");
  }
  return concerns.slice(0, 8);
}

function scoreFit({
  matchedKeywords,
  rfpSections,
  deadlineSignals,
  documentSignals,
  eligibilitySignals,
  textLength,
}: {
  matchedKeywords: string[];
  rfpSections: GrantRfpSection[];
  deadlineSignals: string[];
  documentSignals: string[];
  eligibilitySignals: GrantRfpEligibilitySignals;
  textLength: number;
}) {
  const entityCount = Object.values(eligibilitySignals).filter((signals) => signals.length > 0).length;
  const raw =
    Math.min(matchedKeywords.length * 6, 42) +
    Math.min(rfpSections.length * 5, 18) +
    Math.min(deadlineSignals.length * 4, 12) +
    Math.min(documentSignals.length * 3, 12) +
    entityCount * 4 +
    (textLength > 5_000 ? 8 : textLength > 1_000 ? 4 : 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function buildFitSummary(
  fitScore: number,
  matchedKeywords: string[],
  deadlineSignals: string[],
  documentSignals: string[],
) {
  const level = fitScore >= 75 ? "높습니다" : fitScore >= 45 ? "검토 가치가 있습니다" : "낮거나 원문 확인이 더 필요합니다";
  const keywordText =
    matchedKeywords.length > 0
      ? `주제 매칭은 ${matchedKeywords.slice(0, 6).join(", ")} 중심으로 확인됩니다.`
      : "현재 주제 키워드와의 직접 매칭은 약합니다.";
  const scheduleText =
    deadlineSignals.length > 0
      ? "마감/접수 일정 신호가 있어 준비 일정표로 옮길 수 있습니다."
      : "마감 일정은 원문에서 추가 확인해야 합니다.";
  const docText =
    documentSignals.length > 0
      ? "필수 제출서류 후보도 일부 추출되었습니다."
      : "필수 서류 목록은 첨부 RFP나 공고문에서 추가 확인이 필요합니다.";
  return `적합도는 ${fitScore}점으로 ${level}. ${keywordText} ${scheduleText} ${docText}`;
}

function buildRecommendedActions(
  fitScore: number,
  deadlineSignals: string[],
  documentSignals: string[],
  eligibilitySignals: GrantRfpEligibilitySignals,
) {
  const actions = [
    "RFP 원문에서 지원대상, 주관기관, 공동/위탁 참여 가능 여부를 최종 확인합니다.",
    "아주대학교, 아주대병원, 와이어젠 중 주관 후보와 참여 역할을 먼저 나눕니다.",
  ];
  if (fitScore >= 60) actions.unshift("지원후보과제로 등록하고 내부 검토 마감일을 공고 마감 3-7일 전으로 잡습니다.");
  if (deadlineSignals.length === 0) actions.push("접수 마감일이 추출되지 않았으므로 공고 페이지나 첨부파일에서 날짜를 수동 확인합니다.");
  if (documentSignals.length === 0) actions.push("필수 제출서류 목록이 추출되지 않았으므로 RFP 별첨을 추가 업로드합니다.");
  if (eligibilitySignals.graduate.length > 0 || eligibilitySignals.postdoc.length > 0) {
    actions.push("대학원생/포닥 개인 지원형이면 지도교수 확인서, CV, 학적/학위 증명 서류를 먼저 준비합니다.");
  }
  if (eligibilitySignals.company.length > 0) {
    actions.push("기업 참여형이면 사업자등록증, 재무/고용 자료, IP/사업화 계획을 와이어젠 담당으로 배정합니다.");
  }
  if (eligibilitySignals.hospital.length > 0) {
    actions.push("병원/임상 요소가 있으면 IRB, 환자군, 의료데이터 사용 가능성을 아주대병원 담당과 확인합니다.");
  }
  return actions.slice(0, 8);
}

function guessTitle(text: string) {
  const lines = text
    .split(/\n|(?<=다\.)\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 160)
    .filter((line) => !line.includes("RFP_ATTACHMENT_TEXT"));
  return lines.find((line) => /공고|사업|RFP|제안|지원|grant|funding/i.test(line)) ?? lines[0] ?? null;
}

function normalizeExtractedText(value: string) {
  return decodeXmlEntities(value)
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesLoose(normalizedText: string, term: string) {
  const normalizedTerm = normalizeForSearch(term);
  if (!normalizedTerm) return false;
  if (normalizedText.includes(normalizedTerm)) return true;
  const parts = normalizedTerm.split(" ").filter((part) => part.length >= 2);
  return parts.length >= 2 && parts.every((part) => normalizedText.includes(part));
}

function excerptAroundPattern(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return null;
  return excerptAroundIndex(text, match.index, 130, 280);
}

function excerptAroundTerm(text: string, term: string) {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return null;
  const index = text.toLowerCase().indexOf(normalizedTerm.toLowerCase());
  if (index < 0) return null;
  return excerptAroundIndex(text, index, 120, 260);
}

function excerptAroundIndex(text: string, index: number, before: number, after: number) {
  const start = Math.max(0, index - before);
  const end = Math.min(text.length, index + after);
  return text
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

function extractJson(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "";
}

function normalizeList(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeDecisionSummary(
  value: unknown,
  fallback: GrantRfpDecisionSummary,
): GrantRfpDecisionSummary {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Record<string, unknown>;
  const coreKeywords = normalizeList(record.coreKeywords).slice(0, 18);
  const goals = normalizeList(record.goals).map(conciseValue).map(stripGoalAdministrativeTail).filter(isUsefulGoal).slice(0, 5);
  return {
    coreKeywords: coreKeywords.length > 0 ? coreKeywords : fallback.coreKeywords,
    researchPeriod: normalizeFact(record.researchPeriod, fallback.researchPeriod),
    funding: normalizeFact(record.funding, fallback.funding),
    mainResearchObjective: normalizeFact(record.mainResearchObjective, fallback.mainResearchObjective),
    goals: goals.length > 0 ? goals : fallback.goals,
    threeBookFiveProjectRule: normalizeFact(
      record.threeBookFiveProjectRule,
      fallback.threeBookFiveProjectRule,
    ),
    entityEligibility: {
      school: normalizeEntityDecision(record.entityEligibility, "school", fallback),
      hospital: normalizeEntityDecision(record.entityEligibility, "hospital", fallback),
      company: normalizeEntityDecision(record.entityEligibility, "company", fallback),
      graduate: normalizeEntityDecision(record.entityEligibility, "graduate", fallback),
      postdoc: normalizeEntityDecision(record.entityEligibility, "postdoc", fallback),
    },
  };
}

function normalizeFact(value: unknown, fallback: GrantRfpDecisionSummary["researchPeriod"]) {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Record<string, unknown>;
  const factValue = typeof record.value === "string" && record.value.trim() ? record.value.trim() : fallback.value;
  const evidence =
    typeof record.evidence === "string" && record.evidence.trim()
      ? record.evidence.trim()
      : fallback.evidence;
  return { value: factValue, evidence };
}

function normalizeEntityDecision(
  entityEligibility: unknown,
  entity: GrantEntityType,
  fallback: GrantRfpDecisionSummary,
) {
  if (typeof entityEligibility !== "object" || entityEligibility === null) {
    return fallback.entityEligibility[entity];
  }
  const entityValue = (entityEligibility as Record<string, unknown>)[entity];
  if (typeof entityValue !== "object" || entityValue === null) {
    return fallback.entityEligibility[entity];
  }
  const record = entityValue as Record<string, unknown>;
  const decision = normalizeDecision(record.decision, fallback.entityEligibility[entity].decision);
  return {
    decision,
    label:
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : fallback.entityEligibility[entity].label,
    evidence:
      typeof record.evidence === "string" && record.evidence.trim()
        ? record.evidence.trim()
        : fallback.entityEligibility[entity].evidence,
    action:
      typeof record.action === "string" && record.action.trim()
        ? record.action.trim()
        : fallback.entityEligibility[entity].action,
  };
}

function normalizeDecision(value: unknown, fallback: GrantRfpEligibilityDecision) {
  return value === "eligible" || value === "possible" || value === "unclear" || value === "ineligible"
    ? value
    : fallback;
}

function normalizeSections(values: unknown): GrantRfpSection[] | null {
  if (!Array.isArray(values)) return null;
  const sections = values
    .map((value) => {
      if (typeof value !== "object" || value === null) return null;
      const record = value as Record<string, unknown>;
      return typeof record.label === "string" && typeof record.excerpt === "string"
        ? { label: record.label, excerpt: record.excerpt }
        : null;
    })
    .filter((value): value is GrantRfpSection => Boolean(value))
    .slice(0, 8);
  return sections.length > 0 ? sections : null;
}

function normalizeEligibilitySignals(values: unknown): GrantRfpEligibilitySignals | null {
  if (typeof values !== "object" || values === null) return null;
  const record = values as Record<string, unknown>;
  return {
    school: normalizeList(record.school).slice(0, 4),
    hospital: normalizeList(record.hospital).slice(0, 4),
    company: normalizeList(record.company).slice(0, 4),
    graduate: normalizeList(record.graduate).slice(0, 4),
    postdoc: normalizeList(record.postdoc).slice(0, 4),
  };
}

function clampScore(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fileNameFromContentDisposition(disposition: string) {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return normalizeRemoteFileName(utf8Match[1].replace(/"/g, ""));
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ? normalizeRemoteFileName(asciiMatch[1]) : null;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeRemoteFileName(value: string) {
  return safeDecodeURIComponent(value).replace(/\+/g, " ").trim();
}

function isHtmlResponse(buffer: Buffer, contentType: string, fileName: string) {
  if (contentType.toLowerCase().includes("text/html")) return true;
  if (detectGrantRfpFileType(fileName, contentType) !== "unsupported") return false;
  return buffer.subarray(0, 300).toString("utf8").toLowerCase().includes("<html");
}

function parseIrisAttachments(html: string, baseUrl: URL) {
  const attachments: GrantDocumentLink[] = [];
  const pattern =
    /f_bsnsAncm_downloadAtchFile\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'\s*\)/g;

  for (const match of html.matchAll(pattern)) {
    const [, atchDocId, atchFileId, rawFileName, rawFileSize] = match;
    const url = new URL("/comm/file/fileDownload.do", baseUrl.origin);
    url.searchParams.set("atchDocId", atchDocId);
    url.searchParams.set("atchFileId", atchFileId);
    const fileName = normalizeRemoteFileName(rawFileName);
    const kind = classifyGrantAttachment(fileName);
    attachments.push({
      fileName,
      url: url.toString(),
      fileSize: Number.isFinite(Number(rawFileSize)) ? Number(rawFileSize) : null,
      kind,
      label: grantAttachmentLabel(kind),
    });
  }

  return attachments;
}

function chooseBestGrantAttachment(attachments: GrantDocumentLink[]) {
  const [best] = attachments
    .filter((attachment) => /\.(pdf|hwpx|txt|md)$/i.test(attachment.fileName))
    .map((attachment) => ({ attachment, score: attachmentScore(attachment.fileName) }))
    .sort((a, b) => b.score - a.score || (b.attachment.fileSize ?? 0) - (a.attachment.fileSize ?? 0));

  return best && best.score >= 20 ? best.attachment : undefined;
}

function classifyGrantAttachment(fileName: string): GrantDocumentKind {
  if (/과제제안요구서|제안요청서|제안요구서|RFP|세부\s*지원내용|품목개요서|품목개요|품목정의서|품목정의|기술개요서|기술개요|공모과제\s*목록|지원대상과제|과제목록/i.test(fileName)) {
    return "rfp";
  }
  if (/공고문|시행계획|사업안내|공모안내서|안내서/i.test(fileName)) return "notice";
  if (/연구개발계획서|사업계획서|신청서|작성요령|작성\s*양식|서식|양식|첨부서류|제출서류|별지|개인정보|동의서|확약서|추천서|CV|이력서/i.test(fileName)) {
    return "form";
  }
  return "unknown";
}

function grantAttachmentLabel(kind: GrantDocumentKind) {
  if (kind === "rfp") return "RFP/세부지원내용";
  if (kind === "notice") return "공고문/시행계획";
  if (kind === "form") return "서식/양식";
  return "첨부파일";
}

function attachmentScore(fileName: string) {
  let score = 0;
  if (/과제제안요구서|제안요청서|제안요구서|RFP|세부\s*지원내용|품목개요서|품목개요|품목정의서|품목정의|기술개요서|기술개요|공모과제\s*목록|지원대상과제|과제목록/i.test(fileName)) score += 160;
  if (/공고문|시행계획|사업안내|공모안내서|안내서/i.test(fileName)) score += 55;
  if (/연구개발계획서|사업계획서|신청서/i.test(fileName)) score -= 45;
  if (/별첨|붙임|첨부/i.test(fileName)) score += 5;
  if (/접수\s*매뉴얼|매뉴얼|manual|작성요령|작성\s*양식|서식|양식|FAQ|자주|참고자료|전산|온라인|IRIS|사용자|신청방법|협약|규정|개인정보|동의서|보안|별지/i.test(fileName)) score -= 100;
  if (/\.pdf$/i.test(fileName)) score += 10;
  if (/\.hwpx$/i.test(fileName)) score += 15;
  return score;
}

function htmlToPlainText(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h\d)>/gi, "\n");
  return decodeXmlEntities(stripTags(withoutNoise));
}

function extractMainHtml(html: string) {
  return (
    html.match(/<div id="contentWrap"[\s\S]*?<input type="hidden" name="ancmPrg"/i)?.[0] ??
    html.match(/<div id="content"[\s\S]*?<div class="btn_area"/i)?.[0] ??
    html
  );
}

function pageTextFileName(url: URL, fallbackName: string) {
  const ancmId = url.searchParams.get("ancmId");
  if (ancmId) return `iris-${ancmId}-notice-page.txt`;
  const normalized = normalizeRemoteFileName(fallbackName);
  return normalized.endsWith(".txt") ? normalized : `${normalized || "grant-notice-page"}.txt`;
}

function responseCookieHeader(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : [headers.get("set-cookie") ?? ""].filter(Boolean);
  return setCookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}
