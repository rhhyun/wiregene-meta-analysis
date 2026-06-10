"use client";

import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileText,
  GraduationCap,
  Hospital,
  Link2,
  Loader2,
  SearchCheck,
  UploadCloud,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";
import type {
  GrantEntityType,
  GrantRfpEligibilitySignals,
  GrantRfpUploadAnalysis,
} from "@/lib/types";

const defaultTopics = [
  "척수손상 및 신경재활",
  "재활로봇, 웨어러블 보조기기, 의료기기",
  "의료 AI, 병원 데이터 기반 임상연구",
  "근감소증, 노쇠, 고령친화 재활",
  "BCI, neuromodulation, brain-spine interface",
];

const defaultKeywords = [
  "RFP",
  "과제제안요구서",
  "임상시험",
  "IRB",
  "디지털치료기기",
  "사업화",
  "대학원생",
  "포닥",
  "TIPS",
  "spinal cord injury",
];

const entityRows: Array<{
  key: GrantEntityType;
  label: string;
  icon: typeof GraduationCap;
}> = [
  { key: "school", label: "아주대학교", icon: GraduationCap },
  { key: "hospital", label: "아주대병원", icon: Hospital },
  { key: "company", label: "와이어젠·기업", icon: Building2 },
  { key: "graduate", label: "석박통합·대학원생", icon: GraduationCap },
  { key: "postdoc", label: "포닥", icon: UserRound },
];

function listToText(values: string[]) {
  return values.join("\n");
}

async function readAnalysisPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "RFP 분석에 실패했습니다."));
  }
  return payload as { analysis: GrantRfpUploadAnalysis; mode: "upload" | "download" };
}

function scoreTone(score: number) {
  if (score >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (score >= 45) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-rose-200 bg-rose-50 text-rose-950";
}

function formatAnalyzedAt(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function entitySignalCount(signals: GrantRfpEligibilitySignals) {
  return Object.values(signals).filter((items) => items.length > 0).length;
}

export function GrantRfpAnalysisPanel() {
  const analyzingRef = useRef(false);
  const [topicText, setTopicText] = useState(() => listToText(defaultTopics));
  const [keywordText, setKeywordText] = useState(() => listToText(defaultKeywords));
  const [documentUrl, setDocumentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<GrantRfpUploadAnalysis | null>(null);
  const [mode, setMode] = useState<"upload" | "download" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const resultMetrics = useMemo(() => {
    if (!analysis) return null;
    return {
      keywords: analysis.matchedKeywords.length,
      entities: entitySignalCount(analysis.eligibilitySignals),
      deadlines: analysis.deadlineSignals.length,
      documents: analysis.documentSignals.length,
    };
  }, [analysis]);

  async function analyzeRfp() {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setError("");
    setNotice("");
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.set("topics", topicText);
      formData.set("extraKeywords", keywordText);
      formData.set("documentUrl", documentUrl.trim());
      if (file) formData.set("file", file);

      const payload = await readAnalysisPayload(
        await fetch("/api/grants/rfp-analysis", {
          method: "POST",
          body: formData,
        }),
      );
      setAnalysis(payload.analysis);
      setMode(payload.mode);
      setNotice(payload.mode === "download" ? "URL 원문 분석을 완료했습니다." : "업로드 파일 분석을 완료했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "RFP 분석에 실패했습니다. PDF 또는 HWPX 파일을 다시 업로드해 주세요.",
      );
    } finally {
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700">RFP Document Analyzer</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
            공고문·RFP 원문 적합도 분석
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            PDF/HWPX 원문에서 과제제안요구서의 핵심 범위, 접수 마감, 필수서류, 지원 가능 주체를 추출합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={analyzeRfp}
          disabled={isAnalyzing || (!file && !documentUrl.trim())}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SearchCheck className="h-4 w-4" aria-hidden />}
          {isAnalyzing ? "분석 중" : "원문 분석"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            원문 URL
            <div className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 focus-within:border-emerald-500">
              <Link2 className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
              <input
                value={documentUrl}
                onChange={(event) => setDocumentUrl(event.target.value)}
                placeholder="https://..."
                className="h-6 min-w-0 flex-1 border-0 bg-transparent text-sm font-normal outline-none"
              />
            </div>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            업로드 파일
            <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-emerald-700 ring-1 ring-zinc-200">
                  <UploadCloud className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {file ? file.name : "PDF, HWPX, TXT"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    {file ? `${Math.round(file.size / 1024).toLocaleString("ko-KR")} KB` : "공고문 또는 RFP 첨부파일"}
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept=".pdf,.hwpx,.txt,.md,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-3 w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
              />
            </div>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            분석 기준 주제
            <textarea
              value={topicText}
              onChange={(event) => setTopicText(event.target.value)}
              rows={7}
              className="min-h-44 rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal leading-6 outline-emerald-500"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            확장 키워드
            <textarea
              value={keywordText}
              onChange={(event) => setKeywordText(event.target.value)}
              rows={7}
              className="min-h-44 rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal leading-6 outline-emerald-500"
            />
          </label>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-950" role="alert">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950" role="status">
          {notice}
        </div>
      ) : null}

      {analysis && resultMetrics ? (
        <div className="mt-5 grid gap-4">
          <div className={`rounded-lg border p-4 ${scoreTone(analysis.fitScore)}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {mode === "download" ? "URL 직접 분석" : "업로드 분석"} · {analysis.fileName}
                </p>
                <h3 className="mt-1 text-xl font-semibold">{analysis.titleGuess ?? "제목 확인 필요"}</h3>
                <p className="mt-2 text-sm leading-6">{analysis.fitSummary}</p>
                <div className="mt-3 grid gap-2">
                  <KeywordLine title="매칭 키워드" items={analysis.matchedKeywords} />
                  <KeywordLine title="핵심 단어" items={analysis.coreKeywords} />
                </div>
              </div>
              <div className="rounded-md bg-white/70 px-4 py-3 text-center ring-1 ring-black/5">
                <p className="text-xs font-semibold">적합도</p>
                <p className="text-3xl font-semibold">{analysis.fitScore}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <MiniMetric title="주제 매칭" value={resultMetrics.keywords} icon={CheckCircle2} />
            <MiniMetric title="지원주체 신호" value={resultMetrics.entities} icon={Building2} />
            <MiniMetric title="마감 신호" value={resultMetrics.deadlines} icon={CalendarClock} />
            <MiniMetric title="서류 신호" value={resultMetrics.documents} icon={FileText} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <ResultSection title="핵심 RFP 근거" icon={FileCheck2}>
              {analysis.rfpSections.length > 0 ? (
                <div className="grid gap-2">
                  {analysis.rfpSections.map((section) => (
                    <div key={`${section.label}-${section.excerpt}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-sm font-semibold text-zinc-950">{section.label}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">{section.excerpt}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyText>RFP 핵심 문단을 찾지 못했습니다.</EmptyText>
              )}
            </ResultSection>

            <ResultSection title="참여 가능 구분" icon={Building2}>
              <div className="grid gap-2">
                {entityRows.map((row) => {
                  const Icon = row.icon;
                  const signals = analysis.eligibilitySignals[row.key] ?? [];
                  return (
                    <div key={row.key} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-zinc-600" aria-hidden />
                        <p className="text-sm font-semibold text-zinc-950">{row.label}</p>
                        <span className={`ml-auto rounded-md px-2 py-1 text-xs font-semibold ${signals.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}`}>
                          {signals.length > 0 ? "근거 있음" : "확인 필요"}
                        </span>
                      </div>
                      {signals.length > 0 ? (
                        <ul className="mt-2 grid gap-1 text-xs leading-5 text-zinc-600">
                          {signals.slice(0, 2).map((signal) => (
                            <li key={signal}>{signal}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ResultSection>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SignalList title="마감·일정" icon={CalendarClock} items={analysis.deadlineSignals} />
            <SignalList title="준비 서류" icon={FileText} items={analysis.documentSignals} />
            <SignalList title="다음 액션" icon={CheckCircle2} items={analysis.recommendedActions} />
          </div>

          {analysis.concerns.length > 0 ? (
            <ResultSection title="주의할 점" icon={AlertTriangle}>
              <ul className="grid gap-2 text-sm leading-6 text-zinc-700">
                {analysis.concerns.map((concern) => (
                  <li key={concern} className="rounded-md bg-amber-50 p-3 text-amber-950">
                    {concern}
                  </li>
                ))}
              </ul>
            </ResultSection>
          ) : null}

          <p className="text-xs font-medium text-zinc-500">
            분석 시각 {formatAnalyzedAt(analysis.analyzedAt)} · 추출 본문 {analysis.extractedTextLength.toLocaleString("ko-KR")}자
            {analysis.truncated ? " · 장문 문서 일부만 AI 분석에 사용" : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function KeywordLine({ title, items }: { title: string; items: string[] }) {
  const text = items.length > 0 ? items.join(", ") : "확인된 단어 없음";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-white/60 px-3 py-2 text-xs ring-1 ring-black/5">
      <span className="shrink-0 font-semibold">{title}</span>
      <span className="min-w-0 truncate font-medium" title={text}>
        {text}
      </span>
    </div>
  );
}

function MiniMetric({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white text-emerald-700 ring-1 ring-zinc-200">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-500">{title}</p>
          <p className="text-2xl font-semibold text-zinc-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ResultSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-emerald-700" aria-hidden />
        <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SignalList({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof FileText;
  items: string[];
}) {
  return (
    <ResultSection title={title} icon={Icon}>
      {items.length > 0 ? (
        <ul className="grid gap-2 text-sm leading-6 text-zinc-700">
          {items.slice(0, 6).map((item) => (
            <li key={item} className="rounded-md bg-zinc-50 p-3">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyText>원문에서 뚜렷한 신호를 찾지 못했습니다.</EmptyText>
      )}
    </ResultSection>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-zinc-50 p-3 text-sm font-medium text-zinc-500">{children}</p>;
}
