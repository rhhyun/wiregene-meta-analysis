"use client";

import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RunMessage =
  | { status: "success"; text: string }
  | { status: "error"; text: string; hint: string };

function toRunError(error: string | undefined): RunMessage {
  const message = error?.trim() || "리포트 생성에 실패했습니다.";

  if (message.toLowerCase().includes("disabled in production")) {
    return {
      status: "error",
      text: "운영 환경에서는 수동 실행이 비활성화되어 있습니다.",
      hint: "정기 실행은 GitHub Actions에서 처리됩니다. 로컬 개발 환경에서만 이 버튼으로 실행하세요.",
    };
  }

  if (message.includes("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON")) {
    return {
      status: "error",
      text: message,
      hint: "개인 Google Drive는 서비스 계정이 아니라 OAuth 설정을 사용하세요. GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN을 설정해야 안정적으로 저장됩니다.",
    };
  }

  return {
    status: "error",
    text: message,
    hint: "PubMed, 뉴스 수집, Google Drive 저장, OpenAI 설정을 확인한 뒤 다시 실행하세요.",
  };
}

export function RunReportButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<RunMessage | null>(null);

  async function runReport() {
    setIsRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reports/run", { method: "POST" });
      const payload = (await response.json()) as { error?: string; itemCount?: number };

      if (!response.ok) {
        setMessage(toRunError(payload.error));
        return;
      }

      setMessage({ status: "success", text: `저장 완료: ${payload.itemCount ?? 0}개 항목` });
      router.refresh();
    } catch (error) {
      setMessage(toRunError((error as Error).message));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="grid gap-2 sm:min-w-80">
      <button
        type="button"
        onClick={runReport}
        disabled={isRunning}
        title="지금 브리핑 생성"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} aria-hidden />
        {isRunning ? "생성 중" : "지금 실행"}
      </button>
      {message ? (
        <div
          role={message.status === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            message.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-2">
            {message.status === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div>
              <p className="font-semibold">{message.text}</p>
              {message.status === "error" ? (
                <p className="mt-1 text-rose-800">{message.hint}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
