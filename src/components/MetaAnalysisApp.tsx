import { BarChart3, ShieldCheck } from "lucide-react";
import type { CurrentWiregeneUser } from "@/lib/auth-session";
import { MetaStudyWorkspace } from "./MetaStudyWorkspace";

export function MetaAnalysisApp({
  initialSearchQuery,
  currentUser,
  versionLabel,
}: {
  initialSearchQuery?: string;
  currentUser?: CurrentWiregeneUser | null;
  versionLabel: string;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <BarChart3 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-700">Wiregene Meta</p>
              <h1 className="text-2xl font-semibold tracking-normal">메타분석 논문 작성 플랫폼</h1>
              <p className="mt-1 text-xs font-medium text-zinc-500">{versionLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminBadge currentUser={currentUser} />
            <a
              href="https://portal.wiregene.com/?wiregene_from=meta"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Portal
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        <MetaStudyWorkspace initialSearchQuery={initialSearchQuery} />
      </div>
    </main>
  );
}

function AdminBadge({ currentUser }: { currentUser?: CurrentWiregeneUser | null }) {
  if (!currentUser?.isAdmin) return null;

  return (
    <div className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">
      <ShieldCheck className="h-4 w-4" aria-hidden />
      <span>관리자</span>
      <span className="max-w-48 truncate text-xs font-medium text-emerald-700">{currentUser.username}</span>
    </div>
  );
}
