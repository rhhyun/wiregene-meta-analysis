"use client";

import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Hospital,
  Loader2,
  RefreshCw,
  Trash2,
  Users2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GrantRfpAnalysisPanel } from "@/components/GrantRfpAnalysisPanel";
import { apiErrorMessage } from "@/components/grant-error-message";
import type {
  GrantCandidateProject,
  GrantCandidateStatus,
  GrantPreparationDocument,
  GrantRfpEligibilityDecision,
  GrantSourceGroup,
} from "@/lib/types";

function sourceGroupLabel(sourceGroup: GrantSourceGroup) {
  if (sourceGroup === "central") return "정부과제";
  if (sourceGroup === "regional-regulatory") return "지자체·규제";
  if (sourceGroup === "investment") return "투자 프로그램";
  if (sourceGroup === "trainee-fellowship") return "대학원생·포닥";
  return "글로벌 연구과제";
}

function statusLabel(status: GrantCandidateStatus) {
  if (status === "preparing") return "준비중";
  if (status === "submitted") return "제출완료";
  if (status === "archived") return "보관";
  return "검토중";
}

function statusTone(status: GrantCandidateStatus) {
  if (status === "preparing") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "submitted") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "archived") return "border-zinc-200 bg-zinc-50 text-zinc-600";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function formatDate(value: string | null) {
  return value ?? "확인 필요";
}

function deadlineDday(value: string | null) {
  if (!value) return null;
  const deadline = new Date(`${value}T23:59:59+09:00`);
  if (Number.isNaN(deadline.getTime())) return null;
  const now = new Date();
  return Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
}

async function loadCandidates() {
  const response = await fetch("/api/grants/candidates", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, "지원후보과제 목록을 불러오지 못했습니다."));
  }
  return (payload.candidates ?? []) as GrantCandidateProject[];
}

export function GrantCandidateBoard() {
  const analyzingIdsRef = useRef(new Set<string>());
  const removingIdsRef = useRef(new Set<string>());
  const [candidates, setCandidates] = useState<GrantCandidateProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "warning">("success");
  const isCandidateActionBusy = Boolean(analyzingId || removingId);

  const metrics = useMemo(
    () => ({
      total: candidates.length,
      high: candidates.filter((candidate) => candidate.priority === "high").length,
      dueSoon: candidates.filter((candidate) => {
        const dDay = deadlineDday(candidate.proposalDeadline);
        return dDay !== null && dDay <= 14;
      }).length,
      preparing: candidates.filter((candidate) => candidate.status === "preparing").length,
    }),
    [candidates],
  );

  async function refreshCandidates() {
    setIsLoading(true);
    setError("");
    setNotice("");
    try {
      setCandidates(await loadCandidates());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "지원후보과제 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function analyzeCandidateRfp(candidateId: string) {
    if (analyzingIdsRef.current.size > 0 || removingIdsRef.current.size > 0) return;
    analyzingIdsRef.current.add(candidateId);
    setAnalyzingId(candidateId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/grants/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidateId, action: "analyze-rfp" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "RFP 자동 분석에 실패했습니다."));
      }
      const updated = payload.candidate as GrantCandidateProject;
      setCandidates((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      setNoticeTone(updated.rfpAnalysisError ? "warning" : "success");
      setNotice(
        updated.rfpAnalysisError
          ? "RFP 자동 분석을 완료하지 못했습니다. 후보 카드의 실패 사유를 확인하거나 위 RFP 분석기에 파일을 업로드해 주세요."
          : "RFP 분석을 업데이트했습니다.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RFP 자동 분석에 실패했습니다.");
    } finally {
      analyzingIdsRef.current.delete(candidateId);
      setAnalyzingId("");
    }
  }

  async function removeCandidate(candidateId: string) {
    if (removingIdsRef.current.size > 0 || analyzingIdsRef.current.size > 0) return;
    removingIdsRef.current.add(candidateId);
    const previousCandidates = candidates;
    setRemovingId(candidateId);
    setError("");
    setNotice("");
    setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
    try {
      const response = await fetch(`/api/grants/candidates?id=${encodeURIComponent(candidateId)}&exclude=true`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        details?: unknown;
        exclusionError?: string | null;
      };
      if (!response.ok) {
        if (response.status === 404) {
          setNoticeTone("warning");
          setNotice("이미 후보 목록에 없는 과제라 화면에서도 제거했습니다. 새로고침하면 최신 목록을 다시 확인할 수 있습니다.");
          return;
        }
        throw new Error(apiErrorMessage(payload, "후보과제 배제에 실패했습니다."));
      }
      if (payload.exclusionError) {
        setNoticeTone("warning");
        setNotice(`후보 목록에서는 제거했습니다. 다만 다음 검색 배제 목록 저장은 실패했습니다: ${payload.exclusionError}`);
      } else {
        setNoticeTone("success");
        setNotice("후보과제에서 제거했고, 다음 검색부터 같은 과제는 배제됩니다.");
      }
    } catch (caught) {
      setCandidates(previousCandidates);
      setError(caught instanceof Error ? caught.message : "후보과제 배제에 실패했습니다.");
    } finally {
      removingIdsRef.current.delete(candidateId);
      setRemovingId("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCandidates(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="grid gap-5">
      <GrantRfpAnalysisPanel />

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Application Candidate Board</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">지원후보과제 준비 현황</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              검색 결과에서 선택한 과제를 연구계획서 마감, 준비 서류, 아주대학교·아주대병원·와이어젠 역할로 나누어 정리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshCandidates}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ClipboardCheck className="h-4 w-4" aria-hidden />}
            새로고침
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <BoardMetric title="등록 과제" value={metrics.total} icon={ClipboardCheck} tone="text-emerald-700 bg-emerald-50 ring-emerald-100" />
        <BoardMetric title="우선 검토" value={metrics.high} icon={CheckCircle2} tone="text-sky-700 bg-sky-50 ring-sky-100" />
        <BoardMetric title="14일 내 마감" value={metrics.dueSoon} icon={CalendarClock} tone="text-rose-700 bg-rose-50 ring-rose-100" />
        <BoardMetric title="준비중" value={metrics.preparing} icon={FileText} tone="text-violet-700 bg-violet-50 ring-violet-100" />
      </section>

      {error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-950" role="alert">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        </section>
      ) : null}

      {notice ? (
        <section
          className={`rounded-lg border p-4 text-sm font-semibold ${
            noticeTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
          role="status"
        >
          {notice}
        </section>
      ) : null}

      {isLoading ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 text-sm font-semibold text-zinc-600">
          지원후보과제를 불러오는 중입니다.
        </section>
      ) : null}

      {!isLoading && candidates.length === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-base font-semibold text-zinc-900">아직 등록된 지원후보과제가 없습니다.</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            정부과제, 지자체·규제 과제, 투자 프로그램, 글로벌 연구과제 검색 결과에서 지원후보 등록을 누르면 이곳에 정리됩니다.
          </p>
        </section>
      ) : null}

      <div className="grid gap-4">
        {candidates.map((candidate) => (
          <GrantCandidateCard
            key={candidate.id}
            candidate={candidate}
            isAnalyzing={analyzingId === candidate.id}
            isRemoving={removingId === candidate.id}
            isActionBusy={isCandidateActionBusy}
            onAnalyze={() => analyzeCandidateRfp(candidate.id)}
            onRemove={() => removeCandidate(candidate.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BoardMetric({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof ClipboardCheck;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ${tone}`}>
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

function GrantCandidateCard({
  candidate,
  isAnalyzing,
  isRemoving,
  isActionBusy,
  onAnalyze,
  onRemove,
}: {
  candidate: GrantCandidateProject;
  isAnalyzing: boolean;
  isRemoving: boolean;
  isActionBusy: boolean;
  onAnalyze: () => void;
  onRemove: () => void;
}) {
  const dDay = deadlineDday(candidate.proposalDeadline);
  const linkedDocs = candidate.preparationDocuments.filter((document) => document.sourceUrl).length;

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(candidate.status)}`}>
              {statusLabel(candidate.status)}
            </span>
            <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
              {sourceGroupLabel(candidate.sourceGroup)}
            </span>
            <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
              우선순위 {candidate.priority.toUpperCase()}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-7 text-zinc-950">{candidate.opportunity.title}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {[candidate.opportunity.ministry, candidate.opportunity.agency].filter(Boolean).join(" · ") || candidate.opportunity.source}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving || isAnalyzing || isActionBusy}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
          >
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            후보 배제
          </button>
          <a
            href={candidate.opportunity.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 transition hover:border-emerald-300 hover:text-emerald-800"
          >
            원문
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <SummaryCell label="연구계획서 마감" value={formatDate(candidate.proposalDeadline)} detail={dDay === null ? "원문 확인 필요" : `D-${dDay}`} />
        <SummaryCell label="내부 검토 목표" value={formatDate(candidate.internalReviewDeadline)} detail="산학협력단·참여기관 검토" />
        <SummaryCell label="서류 링크" value={`${linkedDocs}/${candidate.preparationDocuments.length}개`} detail="원문·첨부 확인" />
        <SummaryCell label="참여 구분" value={candidate.sourceGroup === "trainee-fellowship" ? "석박통합 · 포닥 · 멘토" : "아주대 · 병원 · 와이어젠"} detail={`${candidate.participationUnits.length}개 역할`} />
      </div>

      <RfpDecisionPanel candidate={candidate} isAnalyzing={isAnalyzing} isActionBusy={isActionBusy} onAnalyze={onAnalyze} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-700" aria-hidden />
            <h4 className="text-sm font-semibold text-zinc-950">서류 링크</h4>
          </div>
          <div className="mt-3 grid gap-2">
            {candidate.preparationDocuments.map((document) => (
              <DocumentLinkRow key={document.id} document={document} />
            ))}
          </div>
        </section>

        <details className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-950">
            <Users2 className="h-4 w-4 text-emerald-700" aria-hidden />
            참여기관 역할
          </summary>
          <div className="mt-3 grid gap-2">
            {candidate.participationUnits.map((unit) => (
              <div key={unit.id} className="rounded-md border border-zinc-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <EntityGlyph entity={unit.entityType === "graduate" || unit.entityType === "postdoc" ? "school" : unit.entityType} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900">{unit.name}</p>
                    <p className="mt-1 text-xs font-medium text-zinc-500">{unit.participationRole}</p>
                    <p className="mt-2 text-xs font-semibold text-zinc-700">{unit.requiredDocuments.slice(0, 4).join(", ")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>

      </div>
    </article>
  );
}

function DocumentLinkRow({ document }: { document: GrantPreparationDocument }) {
  const label = document.sourceLabel || "열기";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">{document.title}</p>
        {document.sourceName ? (
          <p className="mt-1 truncate text-xs font-medium text-zinc-600">첨부: {document.sourceName}</p>
        ) : null}
        <p className="mt-1 text-xs font-medium text-zinc-500">
          {document.required ? "필수" : "해당 시"} · {formatDate(document.dueDate)}
        </p>
      </div>
      {document.sourceUrl ? (
        <a
          href={document.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          {label}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : (
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-500">링크 없음</span>
      )}
    </div>
  );
}

function RfpDecisionPanel({
  candidate,
  isAnalyzing,
  isActionBusy,
  onAnalyze,
}: {
  candidate: GrantCandidateProject;
  isAnalyzing: boolean;
  isActionBusy: boolean;
  onAnalyze: () => void;
}) {
  const analysis = candidate.rfpAnalysis;
  const decision = analysis?.decisionSummary;
  const coreKeywords = decision?.coreKeywords ?? analysis?.coreKeywords ?? [];
  const goals = cleanGoalItems(decision?.goals ?? []);

  return (
    <section className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
            <h4 className="text-sm font-semibold text-zinc-950">RFP 핵심 판단</h4>
          </div>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            {analysis
              ? `${analysis.fileName} · 적합도 ${analysis.fitScore}점`
              : "원문 URL에서 RFP를 자동 확인하거나, 직접 받은 RFP는 위 분석기에 업로드해 확인합니다."}
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing || isActionBusy}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-zinc-400"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          {isAnalyzing ? "분석 중" : analysis ? "RFP 재분석" : "RFP 자동 분석"}
        </button>
      </div>

      {candidate.rfpAnalysisError ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
          자동 분석 실패: {candidate.rfpAnalysisError}
        </p>
      ) : null}

      {analysis && decision ? (
        <div className="mt-4 grid gap-4">
          <OneLineKeywords title="핵심 단어" items={coreKeywords} />

          <div className="grid gap-3 lg:grid-cols-5">
            <RfpFactCell title="연구기간" value={decision.researchPeriod.value} evidence={decision.researchPeriod.evidence} />
            <RfpFactCell title="연구비" value={decision.funding.value} evidence={decision.funding.evidence} />
            <RfpFactCell title="핵심 연구목표" value={decision.mainResearchObjective.value} evidence={decision.mainResearchObjective.evidence} wide />
            <RfpFactCell title="3책5공" value={decision.threeBookFiveProjectRule.value} evidence={decision.threeBookFiveProjectRule.evidence} />
          </div>

          {goals.length > 0 ? (
            <div className="rounded-md border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-500">세부 목표</p>
              <ul className="mt-2 grid gap-1 text-sm leading-6 text-zinc-700">
                {goals.map((goal) => (
                  <li key={goal} className="rounded-md bg-zinc-50 px-3 py-2">
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            {(["school", "hospital", "company"] as const).map((entity) => (
              <EligibilityCard key={entity} entity={entity} decision={decision.entityEligibility[entity]} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-600">
          아직 후보과제에 연결된 RFP 분석이 없습니다. `RFP 자동 분석`을 누르면 공고 URL의 RFP/첨부파일을 읽어 핵심 판단 항목으로 정리합니다.
        </div>
      )}
    </section>
  );
}

function cleanGoalItems(values: string[]) {
  return [
    ...new Set(
      values
        .map(cleanGoalText)
        .filter((value) => value.length >= 16)
        .filter((value) => value.length <= 220)
        .filter((value) => /목표|개발|구축|검증|실증|평가|고도화|임상|데이터|AI|의료|재활|신경|척수|사업화|제품화/i.test(value))
        .filter((value) => !isNonGoalText(value)),
    ),
  ].slice(0, 4);
}

function isNonGoalText(value: string) {
  return /공고번호|공고명|공고일자|재공고|사업담당자|연락처|접수\s*개시|소관부처|전문기관|지원대상|신청자격|지원규모|지원기간|제출서류|관리번호|RFP\s*유형코드|TRL\s*단계|목적·내용\s*성과물|대상과제\s*공고|신규과제\s*공모|시행계획\s*공고|사업기간\/예산|정부출연금/i.test(
    value,
  );
}

function cleanGoalText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const [goalPart] = normalized.split(
    /\s*(?:□|■|○|ㅇ|\*)\s*(?:사업기간|지원규모|지원기간|신청자격|지원대상|제출서류|접수기간|공고기간|사업비|정부출연금|평가절차)|\s+사업기간\/예산|\s+지원규모|\s+지원기간|\s+신청자격|\s+제출서류/i,
  );
  return (goalPart || normalized).replace(/\s+/g, " ").trim();
}

function OneLineKeywords({ title, items }: { title: string; items: string[] }) {
  const text = items.length > 0 ? items.join(", ") : "확인 필요";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
      <span className="shrink-0 font-semibold text-zinc-700">{title}</span>
      <span className="min-w-0 truncate text-zinc-600" title={text}>
        {text}
      </span>
    </div>
  );
}

function RfpFactCell({
  title,
  value,
  evidence,
  wide = false,
}: {
  title: string;
  value: string;
  evidence: string | null;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-md border border-zinc-200 bg-white p-3 ${wide ? "lg:col-span-2" : ""}`}>
      <p className="text-xs font-semibold text-zinc-500">{title}</p>
      <p className="mt-1 line-clamp-3 text-sm font-semibold leading-6 text-zinc-950">{value}</p>
      {evidence ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{evidence}</p> : null}
    </div>
  );
}

function EligibilityCard({
  entity,
  decision,
}: {
  entity: "school" | "hospital" | "company";
  decision: {
    decision: GrantRfpEligibilityDecision;
    label: string;
    evidence: string | null;
    action: string;
  };
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <EntityGlyph entity={entity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-950">{entityLabel(entity)}</p>
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${decisionTone(decision.decision)}`}>
              {decision.label}
            </span>
          </div>
          {decision.evidence ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-600">{decision.evidence}</p> : null}
          <p className="mt-2 text-xs font-semibold leading-5 text-zinc-700">{decision.action}</p>
        </div>
      </div>
    </div>
  );
}

function EntityGlyph({ entity }: { entity: "school" | "hospital" | "company" }) {
  if (entity === "school") {
    return <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden />;
  }
  if (entity === "hospital") {
    return <Hospital className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden />;
  }
  return <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden />;
}

function entityLabel(entity: "school" | "hospital" | "company") {
  if (entity === "school") return "학교";
  if (entity === "hospital") return "병원";
  return "회사";
}

function decisionTone(decision: GrantRfpEligibilityDecision) {
  if (decision === "eligible") return "bg-emerald-100 text-emerald-800";
  if (decision === "possible") return "bg-sky-100 text-sky-800";
  if (decision === "ineligible") return "bg-rose-100 text-rose-800";
  return "bg-zinc-100 text-zinc-600";
}

function SummaryCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
