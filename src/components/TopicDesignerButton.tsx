"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PencilLine,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TopicProfile } from "@/lib/types";

type ApplyMode = "one-time" | "ongoing";
type BusyAction = "generate" | "refine" | "save" | "run" | null;
type Notice =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string };

type ListField =
  | "terms"
  | "meshTerms"
  | "koreanTerms"
  | "highImpactJournals"
  | "usNewsTerms"
  | "krNewsTerms";

const maxDaysBack = 365;

function listToText(value: string[]) {
  return value.join("\n");
}

function textToList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyTopic(index: number): TopicProfile {
  return {
    slug: `new-topic-${index}`,
    name: "New Research Topic",
    description: "Describe the research scope.",
    terms: [],
    meshTerms: [],
    koreanTerms: [],
    highImpactJournals: [],
    usNewsTerms: [],
    krNewsTerms: [],
  };
}

async function readPayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldErrors =
      payload.details?.fieldErrors && typeof payload.details.fieldErrors === "object"
        ? Object.entries(payload.details.fieldErrors)
            .map(([field, errors]) => `${field}: ${(errors as string[]).join(", ")}`)
            .join("; ")
        : "";
    const message = [
      typeof payload.error === "string" ? payload.error : `Request failed: ${response.status}`,
      fieldErrors,
    ]
      .filter(Boolean)
      .join(" ");
    throw new Error(message);
  }
  return payload;
}

function safeDaysBack(value: number) {
  return Number.isFinite(value) && value >= 1 ? Math.min(maxDaysBack, Math.floor(value)) : 7;
}

export function TopicDesignerButton({ initialTopics }: { initialTopics: TopicProfile[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [topics, setTopics] = useState<TopicProfile[]>(initialTopics);
  const [daysBack, setDaysBack] = useState(7);
  const [applyMode, setApplyMode] = useState<ApplyMode>("one-time");
  const [instructions, setInstructions] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);

  function open() {
    setTopics(initialTopics);
    setNotice(null);
    setIsOpen(true);
  }

  function updateTopic(index: number, patch: Partial<TopicProfile>) {
    setTopics((current) =>
      current.map((topic, topicIndex) =>
        topicIndex === index ? { ...topic, ...patch } : topic,
      ),
    );
  }

  function updateList(index: number, field: ListField, value: string) {
    updateTopic(index, { [field]: textToList(value) } as Partial<TopicProfile>);
  }

  async function runAi(mode: "generate" | "refine") {
    setBusy(mode);
    setNotice(null);
    try {
      const payload = await readPayload(
        await fetch("/api/topics/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, topics, instructions }),
        }),
      );
      setTopics(payload.topics as TopicProfile[]);
      setNotice({
        kind: payload.model ? "success" : "info",
        text: payload.model
          ? "AI가 연구주제 초안을 갱신했습니다."
          : "OpenAI 키가 없어 정규화된 초안으로 갱신했습니다.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function saveTopics() {
    setBusy("save");
    setNotice(null);
    try {
      const payload = await readPayload(
        await fetch("/api/topics", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topics }),
        }),
      );
      setTopics(payload.topics as TopicProfile[]);
      setNotice({ kind: "success", text: "앞으로의 기본 검색주제를 저장했습니다." });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function runReport() {
    setBusy("run");
    setNotice(null);
    const normalizedDaysBack = safeDaysBack(daysBack);
    setDaysBack(normalizedDaysBack);
    try {
      const payload = await readPayload(
        await fetch("/api/reports/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topics, daysBack: normalizedDaysBack, applyMode }),
        }),
      );
      setNotice({
        kind: "success",
        text: `브리핑 생성 완료: ${payload.itemCount ?? 0}개 항목. ${
          applyMode === "ongoing" ? "앞으로도 이 주제를 사용합니다." : "이번 실행에만 적용했습니다."
        }`,
      });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="검색주제 변경"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500"
      >
        <PencilLine className="h-4 w-4" aria-hidden />
        검색주제 변경
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/40 px-4 py-6">
          <div className="mx-auto max-w-6xl rounded-lg bg-white shadow-xl ring-1 ring-zinc-200">
            <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">검색주제 설계</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  AI 초안, 연구자 수정, AI 재수정을 반복해 브리핑 기준을 다듬습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="닫기"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 transition hover:border-zinc-500"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="grid gap-5 px-5 py-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-zinc-800">AI 수정 지시</span>
                  <textarea
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    rows={3}
                    placeholder="예: 임상 적용 가능성이 높은 주제를 우선하고, BCI는 재활 로봇과 연결되는 방향으로 좁혀줘."
                    className="resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none transition focus:border-emerald-600"
                  />
                </label>

                <div className="grid content-start gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-zinc-800">검색 기간</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={maxDaysBack}
                        value={daysBack}
                        onChange={(event) => setDaysBack(Number(event.target.value))}
                        className="h-10 w-24 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-emerald-600"
                      />
                      <span className="text-sm text-zinc-600">일 전부터</span>
                    </div>
                  </label>

                  <div className="grid grid-cols-2 rounded-md border border-zinc-300 p-1 text-sm font-semibold">
                    <button
                      type="button"
                      onClick={() => setApplyMode("one-time")}
                      className={`h-9 rounded px-2 ${
                        applyMode === "one-time"
                          ? "bg-zinc-950 text-white"
                          : "text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      이번 1회만
                    </button>
                    <button
                      type="button"
                      onClick={() => setApplyMode("ongoing")}
                      className={`h-9 rounded px-2 ${
                        applyMode === "ongoing"
                          ? "bg-zinc-950 text-white"
                          : "text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      계속 적용
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runAi("generate")}
                  disabled={busy !== null}
                  title="검색 결과를 통한 연구주제 생성"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 disabled:opacity-60"
                >
                  {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  검색 결과로 생성
                </button>
                <button
                  type="button"
                  onClick={() => runAi("refine")}
                  disabled={busy !== null}
                  title="AI로 재수정"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-800 transition hover:border-sky-400 disabled:opacity-60"
                >
                  {busy === "refine" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  AI로 재수정
                </button>
                <button
                  type="button"
                  onClick={() => setTopics((current) => [...current, emptyTopic(current.length + 1)])}
                  disabled={busy !== null || topics.length >= 8}
                  title="주제 추가"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  주제 추가
                </button>
                <button
                  type="button"
                  onClick={saveTopics}
                  disabled={busy !== null}
                  title="계속 적용으로 저장"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500 disabled:opacity-60"
                >
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  저장
                </button>
                <button
                  type="button"
                  onClick={runReport}
                  disabled={busy !== null}
                  title="현재 설정으로 지금 실행"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  지금 실행
                </button>
              </div>

              {notice ? (
                <div
                  role={notice.kind === "error" ? "alert" : "status"}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    notice.kind === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-950"
                      : notice.kind === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : "border-sky-200 bg-sky-50 text-sky-950"
                  }`}
                >
                  {notice.kind === "error" ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <p className="font-medium">{notice.text}</p>
                </div>
              ) : null}

              <div className="grid gap-4">
                {topics.map((topic, index) => (
                  <section
                    key={`${topic.slug}-${index}`}
                    className="rounded-lg border border-zinc-200 p-4"
                  >
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-zinc-500">주제명</span>
                        <input
                          value={topic.name}
                          onChange={(event) => updateTopic(index, { name: event.target.value })}
                          className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-emerald-600"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-semibold text-zinc-500">슬러그</span>
                        <input
                          value={topic.slug}
                          onChange={(event) => updateTopic(index, { slug: event.target.value })}
                          className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-emerald-600"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTopics((current) =>
                            current.length > 1
                              ? current.filter((_, topicIndex) => topicIndex !== index)
                              : current,
                          )
                        }
                        disabled={topics.length <= 1}
                        title="주제 삭제"
                        className="inline-flex h-10 w-10 items-center justify-center self-end rounded-md border border-zinc-300 text-zinc-700 transition hover:border-rose-400 hover:text-rose-700 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    <label className="mt-3 grid gap-1">
                      <span className="text-xs font-semibold text-zinc-500">설명</span>
                      <textarea
                        value={topic.description}
                        onChange={(event) => updateTopic(index, { description: event.target.value })}
                        rows={2}
                        className="resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none transition focus:border-emerald-600"
                      />
                    </label>

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <ListEditor
                        label="PubMed 키워드"
                        value={listToText(topic.terms)}
                        onChange={(value) => updateList(index, "terms", value)}
                      />
                      <ListEditor
                        label="MeSH"
                        value={listToText(topic.meshTerms)}
                        onChange={(value) => updateList(index, "meshTerms", value)}
                      />
                      <ListEditor
                        label="한국어 검색어"
                        value={listToText(topic.koreanTerms)}
                        onChange={(value) => updateList(index, "koreanTerms", value)}
                      />
                      <ListEditor
                        label="미국 뉴스"
                        value={listToText(topic.usNewsTerms)}
                        onChange={(value) => updateList(index, "usNewsTerms", value)}
                      />
                      <ListEditor
                        label="한국 뉴스"
                        value={listToText(topic.krNewsTerms)}
                        onChange={(value) => updateList(index, "krNewsTerms", value)}
                      />
                      <ListEditor
                        label="우선 저널"
                        value={listToText(topic.highImpactJournals)}
                        onChange={(value) => updateList(index, "highImpactJournals", value)}
                      />
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-zinc-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm leading-5 outline-none transition focus:border-emerald-600"
      />
    </label>
  );
}
