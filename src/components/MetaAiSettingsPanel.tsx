"use client";

import { AlertCircle, CheckCircle2, KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/components/grant-error-message";

type MetaAiSettingsSummary = {
  providerType: "OPENAI";
  enabled: boolean;
  modelName: string;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
  storagePath: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

const sourceLabels: Record<MetaAiSettingsSummary["apiKeySource"], string> = {
  saved: "saved encrypted key",
  environment: "server environment",
  missing: "not configured",
};

export function MetaAiSettingsPanel() {
  const [settings, setSettings] = useState<MetaAiSettingsSummary | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [modelName, setModelName] = useState("gpt-5-nano");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
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
          <div className="grid gap-3 lg:grid-cols-3">
            <StatusBox label="API key" value={settings?.apiKeyMasked ?? "not configured"} />
            <StatusBox label="Source" value={sourceLabels[settings?.apiKeySource ?? "missing"]} />
            <StatusBox label="Updated" value={settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString("ko-KR") : "not saved"} />
          </div>

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

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-zinc-950">{value}</p>
    </div>
  );
}
