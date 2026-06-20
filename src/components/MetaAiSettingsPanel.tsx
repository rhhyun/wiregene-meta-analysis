"use client";

import { AlertCircle, CheckCircle2, Cloud, ExternalLink, HardDrive, KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";

type MetaAiSettingsSummary = {
  providerType: "OPENAI";
  enabled: boolean;
  modelName: string;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
  modelReviewers: MetaAiReviewerSlotSummary[];
  storageBackend: "local-json" | "google-drive";
  storagePath: string;
  storageHealth:
    | "synology-local"
    | "local-json"
    | "google-drive-connected"
    | "google-drive-not-configured"
    | "google-drive-unavailable";
  storageWarning: string | null;
  googleDriveAuthMode: "oauth" | "service-account" | null;
  synologyDownloadPrimary: boolean;
  synologyDownloadPath: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type MetaAiReviewerSlotSummary = {
  id: string;
  label: string;
  providerType: "OPENAI" | "OPENAI_COMPATIBLE";
  enabled: boolean;
  modelName: string;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
};

type ReviewerSlotForm = MetaAiReviewerSlotSummary & {
  apiKeyInput: string;
  clearApiKey: boolean;
};

const sourceLabels: Record<MetaAiSettingsSummary["apiKeySource"], string> = {
  saved: "saved encrypted key",
  environment: "server environment",
  missing: "not configured",
};

function defaultReviewerSlots(settings: MetaAiSettingsSummary): MetaAiReviewerSlotSummary[] {
  return [
    {
      id: "ai_reviewer_1",
      label: "AI reviewer 1",
      providerType: "OPENAI",
      enabled: settings.enabled,
      modelName: settings.modelName,
      baseUrl: null,
      apiKeyMasked: settings.apiKeyMasked,
      apiKeySource: settings.apiKeySource,
    },
    {
      id: "ai_reviewer_2",
      label: "AI reviewer 2",
      providerType: "OPENAI_COMPATIBLE",
      enabled: false,
      modelName: "gpt-5-nano",
      baseUrl: null,
      apiKeyMasked: null,
      apiKeySource: "missing",
    },
    {
      id: "ai_reviewer_3",
      label: "AI reviewer 3",
      providerType: "OPENAI_COMPATIBLE",
      enabled: false,
      modelName: "gemini-3.5-flash",
      baseUrl: null,
      apiKeyMasked: null,
      apiKeySource: "missing",
    },
  ];
}

export function MetaAiSettingsPanel() {
  const [settings, setSettings] = useState<MetaAiSettingsSummary | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [modelName, setModelName] = useState("gpt-5-nano");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [reviewerSlots, setReviewerSlots] = useState<ReviewerSlotForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/meta-analysis/ai-settings", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(payload, "AI 설정을 불러오지 못했습니다."));
        if (!active) return;
        applySettings(payload.settings);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "AI 설정을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  function applySettings(next: MetaAiSettingsSummary) {
    setSettings(next);
    setEnabled(next.enabled);
    setModelName(next.modelName);
    setApiKey("");
    setClearApiKey(false);
    setReviewerSlots(
      (next.modelReviewers.length ? next.modelReviewers : defaultReviewerSlots(next)).map((slot) => ({
        ...slot,
        apiKeyInput: "",
        clearApiKey: false,
      })),
    );
  }

  function updateReviewerSlot(id: string, patch: Partial<ReviewerSlotForm>) {
    setReviewerSlots((current) =>
      current.map((slot, index) => {
        if (slot.id !== id) return slot;
        const nextSlot = { ...slot, ...patch };
        if (index === 0) {
          setEnabled(nextSlot.enabled);
          setModelName(nextSlot.modelName);
        }
        return nextSlot;
      }),
    );
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/meta-analysis/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled,
          modelName,
          apiKey: apiKey.trim() || undefined,
          clearApiKey,
          modelReviewers: reviewerSlots.map((slot, index) => ({
            id: slot.id,
            label: slot.label,
            providerType: slot.providerType,
            enabled: index === 0 ? enabled : slot.enabled,
            modelName: index === 0 ? modelName : slot.modelName,
            baseUrl: slot.baseUrl || null,
            apiKey: index === 0 ? apiKey.trim() || slot.apiKeyInput.trim() || undefined : slot.apiKeyInput.trim() || undefined,
            clearApiKey: index === 0 ? clearApiKey || slot.clearApiKey : slot.clearApiKey,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "AI 설정 저장에 실패했습니다."));
      applySettings(payload.settings);
      setNotice("AI 평가 설정을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700">AI evaluation settings</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">OpenAI full-text 평가 설정</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            저장된 key는 암호화되어 서버 저장소에 남고, full-text include/exclude와 parameter extraction 품질평가에 사용됩니다.
          </p>
        </div>
        <span className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">
          <KeyRound className="h-4 w-4" aria-hidden />
          {settings?.providerType ?? "OPENAI"}
        </span>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          AI 설정을 확인하는 중입니다.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <StatusBox label="API key" value={settings?.apiKeyMasked ?? "not configured"} />
            <StatusBox label="Source" value={sourceLabels[settings?.apiKeySource ?? "missing"]} />
            <StatusBox
              label="Storage"
              value={settings ? storageHealthLabel(settings) : "not loaded"}
              detail={settings?.storagePath}
            />
            <StatusBox label="Updated" value={settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString("ko-KR") : "not saved"} />
          </div>

          <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-950">기본 저장소</p>
                <p className="mt-1 text-sm leading-6 text-zinc-700">
                  Synology/local Docker에서는 연구별 full-text 원문, AI 분석 history, reviewer 검증, extraction 결과를{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-emerald-950">
                    {settings?.synologyDownloadPath ?? "/volume1/docker/meta/download"}/{"{project}"}
                  </code>
                  에 저장합니다. Google Drive는 온라인 공유와 백업용 선택 저장소입니다.
                </p>
              </div>
              <span
                aria-label="Synology storage status"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-900"
              >
                <HardDrive className="h-4 w-4" aria-hidden />
                {settings?.synologyDownloadPrimary ? "Synology 저장 사용 중" : "Synology 저장 가능"}
              </span>
            </div>
          </section>

          <section className={`rounded-md border p-4 ${googleDrivePanelClass(settings?.storageHealth)}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-sky-950">Google Drive online storage</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-zinc-900">
                  현재 상태: {googleDriveStatusLabel(settings)}
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-700">
                  AI 설정 저장소:{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-sky-950">
                    {settings?.storagePath ?? "not loaded"}
                  </code>
                  {settings?.googleDriveAuthMode ? ` · 인증 방식: ${settings.googleDriveAuthMode}` : ""}
                </p>
                {settings?.storageWarning ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
                    {settings.storageWarning}
                  </p>
                ) : null}
              </div>
              <a
                href="/api/google-drive/oauth/start?diagnose=1"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800"
              >
                <Cloud className="h-4 w-4" aria-hidden />
                {googleDriveButtonLabel(settings)}
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[0.7fr_1fr]">
            <label className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-800">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
              OpenAI full-text 평가 사용
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Model
              <input
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder="gpt-5-nano"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-900 outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-zinc-700">
            OpenAI API key
            <input
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                if (event.target.value.trim()) {
                  setClearApiKey(false);
                  setEnabled(true);
                }
              }}
              placeholder={settings?.apiKeyMasked ? "새 key를 입력하면 교체됩니다." : "sk-..."}
              type="password"
              autoComplete="off"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-900 outline-none focus:border-emerald-500"
            />
          </label>

          <label className="flex items-center gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-950">
            <input
              type="checkbox"
              checked={clearApiKey}
              onChange={(event) => {
                setClearApiKey(event.target.checked);
                if (event.target.checked) setApiKey("");
              }}
              className="h-4 w-4 accent-rose-700"
            />
            저장된 OpenAI API key 삭제
          </label>

          <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="text-sm font-semibold text-emerald-900">AI model reviewer slots</p>
              <p className="mt-1 text-sm leading-6 text-zinc-700">
                원문 1개를 여러 AI 모델이 독립적으로 판정하고, 결과 비교 후 연구책임자가 최종 include/exclude를 선택합니다.
                OpenAI-compatible slot은 provider의 base URL과 model명을 직접 입력합니다.
              </p>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              {reviewerSlots.map((slot, index) => (
                <article key={slot.id} className="rounded-md border border-emerald-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <input
                        type="checkbox"
                        checked={index === 0 ? enabled : slot.enabled}
                        onChange={(event) => updateReviewerSlot(slot.id, { enabled: event.target.checked })}
                        className="h-4 w-4 accent-emerald-700"
                      />
                      {slot.label}
                    </label>
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                      {slot.apiKeyMasked ?? "no key"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                      Label
                      <input
                        value={slot.label}
                        onChange={(event) => updateReviewerSlot(slot.id, { label: event.target.value })}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-sm font-normal normal-case text-zinc-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                      Provider
                      <select
                        value={slot.providerType}
                        onChange={(event) =>
                          updateReviewerSlot(slot.id, { providerType: event.target.value as ReviewerSlotForm["providerType"] })
                        }
                        className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm font-normal normal-case text-zinc-900 outline-none focus:border-emerald-500"
                      >
                        <option value="OPENAI">OpenAI Responses</option>
                        <option value="OPENAI_COMPATIBLE">OpenAI-compatible Chat</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                      Model
                      <input
                        value={index === 0 ? modelName : slot.modelName}
                        onChange={(event) =>
                          index === 0
                            ? setModelName(event.target.value)
                            : updateReviewerSlot(slot.id, { modelName: event.target.value })
                        }
                        placeholder={index === 0 ? "gpt-5-nano" : "provider-model-name"}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-sm font-normal normal-case text-zinc-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                      Base URL
                      <input
                        value={slot.baseUrl ?? ""}
                        onChange={(event) => updateReviewerSlot(slot.id, { baseUrl: event.target.value || null })}
                        placeholder={slot.providerType === "OPENAI" ? "OpenAI default" : "https://provider.example/v1"}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-sm font-normal normal-case text-zinc-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">
                      API key
                      <input
                        value={index === 0 ? apiKey || slot.apiKeyInput : slot.apiKeyInput}
                        onChange={(event) => {
                          if (index === 0) {
                            setApiKey(event.target.value);
                            setClearApiKey(false);
                          }
                          updateReviewerSlot(slot.id, { apiKeyInput: event.target.value, clearApiKey: false });
                        }}
                        type="password"
                        autoComplete="off"
                        placeholder={slot.apiKeyMasked ? "Enter only to replace saved key" : "API key"}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-sm font-normal normal-case text-zinc-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-rose-100 bg-rose-50 p-2 text-xs font-semibold text-rose-900">
                      <input
                        type="checkbox"
                        checked={index === 0 ? clearApiKey || slot.clearApiKey : slot.clearApiKey}
                        onChange={(event) => {
                          if (index === 0) {
                            setClearApiKey(event.target.checked);
                            if (event.target.checked) setApiKey("");
                          }
                          updateReviewerSlot(slot.id, {
                            clearApiKey: event.target.checked,
                            apiKeyInput: event.target.checked ? "" : slot.apiKeyInput,
                          });
                        }}
                        className="h-4 w-4 accent-rose-700"
                      />
                      Clear saved key for this slot
                    </label>
                    <p className="text-xs leading-5 text-zinc-500">
                      Source: {sourceLabels[slot.apiKeySource]}.{" "}
                      {slot.providerType === "OPENAI_COMPATIBLE" && !slot.baseUrl && looksLikeOpenAiModel(slot.modelName)
                        ? "OpenAI-like model without Base URL uses the saved OpenAI key and Responses API."
                        : slot.providerType === "OPENAI_COMPATIBLE"
                          ? "Use provider OpenAI-compatible chat endpoint."
                          : "Uses OpenAI Responses API."}
                    </p>
                    {slot.providerType === "OPENAI_COMPATIBLE" &&
                    slot.enabled &&
                    !slot.baseUrl &&
                    !looksLikeOpenAiModel(slot.modelName) ? (
                      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
                        Base URL is required before this compatible reviewer can run.
                      </p>
                    ) : null}
                    {providerModelHint(slot) ? (
                      <p className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs font-semibold leading-5 text-sky-950">
                        {providerModelHint(slot)}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-950" role="alert">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{notice}</span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving || !modelName.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setApiKey("");
                setClearApiKey(true);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-800 transition hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              key 삭제 선택
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusBox({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-zinc-950">{value}</p>
      {detail ? <p className="mt-1 break-words text-xs leading-5 text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function storageHealthLabel(settings: MetaAiSettingsSummary) {
  if (settings.storageHealth === "synology-local") return "Synology/local download";
  if (settings.storageHealth === "local-json") return "local JSON";
  if (settings.storageHealth === "google-drive-connected") return "Google Drive connected";
  if (settings.storageHealth === "google-drive-unavailable") return "Google Drive needs reconnect";
  return "Google Drive not configured";
}

function googleDriveStatusLabel(settings: MetaAiSettingsSummary | null) {
  if (!settings) return "확인 중";
  if (settings.storageHealth === "google-drive-connected") return "연결됨";
  if (settings.storageHealth === "google-drive-unavailable") return "설정은 있으나 재연결 필요";
  if (settings.storageHealth === "google-drive-not-configured") return "미설정";
  return "현재 기본 작업은 Synology/local 저장소 사용";
}

function googleDriveButtonLabel(settings: MetaAiSettingsSummary | null) {
  if (!settings) return "Google Drive 연결 확인";
  if (settings.storageHealth === "google-drive-connected") return "Google Drive 다시 연결";
  if (settings.storageHealth === "google-drive-unavailable") return "Google Drive 재연결";
  if (settings.storageHealth === "google-drive-not-configured") return "Google Drive 연결 시작";
  return "Google Drive 연결 설정";
}

function googleDrivePanelClass(storageHealth: MetaAiSettingsSummary["storageHealth"] | undefined) {
  if (storageHealth === "google-drive-connected") return "border-emerald-200 bg-emerald-50";
  if (storageHealth === "google-drive-unavailable") return "border-amber-200 bg-amber-50";
  return "border-sky-200 bg-sky-50";
}

function providerModelHint(slot: ReviewerSlotForm) {
  const modelName = slot.modelName.toLowerCase();
  const baseUrl = slot.baseUrl?.toLowerCase() ?? "";
  if (slot.providerType === "OPENAI_COMPATIBLE" && (modelName.includes("deepseek") || baseUrl.includes("deepseek"))) {
    return "DeepSeek V4 model ids must be exact lowercase: deepseek-v4-flash or deepseek-v4-pro. DeepSeekV4Flash is saved as deepseek-v4-flash.";
  }

  return "";
}

function looksLikeOpenAiModel(modelName: string) {
  return /^(gpt-|o\d|o-|chatgpt-|ft:)/i.test(modelName.trim());
}
