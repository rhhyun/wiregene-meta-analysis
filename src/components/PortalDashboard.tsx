import {
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  BrainCircuit,
  FlaskConical,
  LayoutDashboard,
  Microscope,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import type { CurrentWiregeneUser } from "@/lib/auth-session";
import { AccountManagementPanel } from "./AccountManagementPanel";

const launcherSites = [
  {
    label: "Research Search",
    shortLabel: "Search",
    href: "https://search.wiregene.com/?wiregene_from=portal",
    detail: "논문, 뉴스, 연구과제 검색과 문헌 관리",
    icon: BookOpenText,
  },
  {
    label: "Meta-analysis",
    shortLabel: "Meta",
    href: "https://meta.wiregene.com/?wiregene_from=portal",
    detail: "PRISMA, 검색식, screening, extraction, analysis",
    icon: BarChart3,
  },
  {
    label: "HyunLab Wiregene Platform",
    shortLabel: "HW ERP",
    href: "https://hyunlab.wiregene.com/?wiregene_from=portal",
    detail: "연구실 운영, ERP, Journal Club",
    icon: LayoutDashboard,
  },
  {
    label: "SCI Experiment",
    shortLabel: "SCI EXP",
    href: "https://sci-experiment.wiregene.com/?wiregene_from=portal",
    detail: "실험 데이터 분석과 결과 관리",
    icon: FlaskConical,
  },
  {
    label: "SCI BBB AI",
    shortLabel: "SCI BBB AI",
    href: "https://sci-bbb.wiregene.com/?wiregene_from=portal",
    detail: "BBB 및 행동실험 분석",
    icon: BrainCircuit,
  },
  {
    label: "ARIM Human",
    shortLabel: "Human",
    href: "https://arim.wiregene.com/?wiregene_from=portal",
    detail: "임상 및 인체 연구 관리",
    icon: Microscope,
  },
];

export function PortalDashboard({
  currentUser,
  versionLabel,
}: {
  currentUser?: CurrentWiregeneUser | null;
  versionLabel: string;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-700">Wiregene Portal</p>
              <h1 className="text-2xl font-semibold tracking-normal">통합 로그인 및 ID 관리</h1>
              <p className="mt-1 text-xs font-medium text-zinc-500">{versionLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminBadge currentUser={currentUser} />
            <a
              href="https://search.wiregene.com/?wiregene_from=portal"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              Search Main
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <SummaryTile label="Connected sites" value={`${launcherSites.length}`} />
          <SummaryTile label="Admin identity" value={currentUser?.username ?? "Not signed in"} />
          <SummaryTile label="Authority" value={currentUser?.roleLabel ?? "User"} />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <UserRoundCog className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-700">Platform Launcher</p>
              <h2 className="text-xl font-semibold tracking-normal">Wiregene 연구 플랫폼</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {launcherSites.map((site) => {
              const Icon = site.icon;
              return (
                <a
                  key={site.href}
                  href={site.href}
                  className="group rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 transition group-hover:bg-white group-hover:text-emerald-700">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:text-emerald-700" aria-hidden />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase text-emerald-700">{site.shortLabel}</p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-950">{site.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{site.detail}</p>
                </a>
              );
            })}
          </div>
        </section>

        <AccountManagementPanel />
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}
