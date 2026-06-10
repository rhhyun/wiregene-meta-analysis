"use client";

import {
  BookOpenText,
  Building2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileSearch,
  FileText,
  Globe2,
  GraduationCap,
  LogOut,
  Menu,
  Network,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { CurrentWiregeneUser } from "@/lib/auth-session";

export type WorkspaceView =
  | "briefing"
  | "central-grants"
  | "investment"
  | "global-research"
  | "trainee-fellowship"
  | "candidate-board"
  | "thesis-management";

type ExternalWorkspaceLink = {
  label: string;
  detail: string;
  href: string;
};

export function ResearchWorkspaceShell({
  briefingPanel,
  centralGrantPanel,
  investmentPanel,
  globalResearchPanel,
  traineeFellowshipPanel,
  candidatePanel,
  thesisManagementPanel,
  externalLinks,
  initialView,
  currentUser,
  versionLabel,
}: {
  briefingPanel: ReactNode;
  centralGrantPanel: ReactNode;
  investmentPanel: ReactNode;
  globalResearchPanel: ReactNode;
  traineeFellowshipPanel: ReactNode;
  candidatePanel: ReactNode;
  thesisManagementPanel: ReactNode;
  externalLinks: ExternalWorkspaceLink[];
  initialView?: WorkspaceView;
  currentUser?: CurrentWiregeneUser | null;
  versionLabel: string;
}) {
  const [view, setView] = useState<WorkspaceView>(initialView ?? "briefing");
  const active = {
    briefing: briefingPanel,
    "central-grants": centralGrantPanel,
    investment: investmentPanel,
    "global-research": globalResearchPanel,
    "trainee-fellowship": traineeFellowshipPanel,
    "candidate-board": candidatePanel,
    "thesis-management": thesisManagementPanel,
  }[view];

  function logout() {
    const { protocol, host } = window.location;
    window.location.href = `${protocol}//logout:logout@${host}/api/auth/logout`;
  }

  function selectView(nextView: WorkspaceView) {
    setView(nextView);
    const url = new URL(window.location.href);
    if (nextView === "briefing") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-zinc-200 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-zinc-200 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <BookOpenText className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-zinc-950">Research Briefing</p>
                  <p className="text-xs font-medium text-zinc-500">{versionLabel}</p>
                </div>
              </div>
              <Menu className="h-5 w-5 text-zinc-400 lg:hidden" aria-hidden />
            </div>
            <AdminBadge currentUser={currentUser} />
            <button
              type="button"
              onClick={logout}
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Logout
            </button>
          </div>

          <nav className="grid gap-2 px-3 py-4">
            <WorkspaceNavButton
              active={view === "briefing"}
              icon={<FileSearch className="h-4 w-4" aria-hidden />}
              label="논문과 기사 검색"
              detail="PubMed, news, Zotero"
              onClick={() => selectView("briefing")}
            />
            <WorkspaceNavButton
              active={view === "central-grants"}
              icon={<ClipboardList className="h-4 w-4" aria-hidden />}
              label="연구과제 검색"
              detail="정부, 지자체, 규제기관"
              onClick={() => selectView("central-grants")}
            />
            <WorkspaceNavButton
              active={view === "investment"}
              icon={<Building2 className="h-4 w-4" aria-hidden />}
              label="투자 프로그램"
              detail="TIPS, 기업투자, Big Tech"
              onClick={() => selectView("investment")}
            />
            <WorkspaceNavButton
              active={view === "global-research"}
              icon={<Globe2 className="h-4 w-4" aria-hidden />}
              label="글로벌 연구과제"
              detail="SCI, NIH, CDMRP"
              onClick={() => selectView("global-research")}
            />
            <WorkspaceNavButton
              active={view === "trainee-fellowship"}
              icon={<GraduationCap className="h-4 w-4" aria-hidden />}
              label="대학원·포닥 과제"
              detail="장학, 통합, fellowship"
              onClick={() => selectView("trainee-fellowship")}
            />
            <WorkspaceNavButton
              active={view === "candidate-board"}
              icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
              label="지원 후보과제"
              detail="마감, 지원여부, RFP"
              onClick={() => selectView("candidate-board")}
            />
            <WorkspaceNavButton
              active={view === "thesis-management"}
              icon={<FileText className="h-4 w-4" aria-hidden />}
              label="논문 관리"
              detail="1_Thesis, Data, References"
              onClick={() => selectView("thesis-management")}
            />

            {externalLinks.length ? (
              <div className="mt-2 border-t border-zinc-200 pt-3">
                <p className="px-3 pb-2 text-xs font-semibold uppercase text-zinc-500">
                  Linked platforms
                </p>
                <div className="grid gap-2">
                  {externalLinks.map((link) => (
                    <ExternalNavLink key={link.href} link={link} />
                  ))}
                </div>
              </div>
            ) : null}
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="border-b border-zinc-200 bg-white">
            <div className="mx-auto max-w-7xl px-5 py-5">
              <p className="text-sm font-semibold text-emerald-700">{viewEyebrow(view)}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">{viewTitle(view)}</h1>
            </div>
          </div>

          <div className="mx-auto max-w-7xl px-5 py-8">{active}</div>
        </section>
      </div>
    </main>
  );
}

function AdminBadge({ currentUser }: { currentUser?: CurrentWiregeneUser | null }) {
  if (!currentUser?.isAdmin) return null;

  return (
    <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        관리자
      </div>
      <p className="mt-1 truncate text-xs font-medium text-emerald-700">{currentUser.username}</p>
    </div>
  );
}

function viewEyebrow(view: WorkspaceView) {
  if (view === "briefing") return "Paper & News Briefing";
  if (view === "central-grants") return "Government & Regional Grants";
  if (view === "investment") return "Investment Programs";
  if (view === "global-research") return "Global Research Grants";
  if (view === "trainee-fellowship") return "Graduate & Postdoc Fellowships";
  if (view === "thesis-management") return "Thesis Management";
  return "Application Candidate Board";
}

function viewTitle(view: WorkspaceView) {
  if (view === "briefing") return "논문과 기사 검색";
  if (view === "central-grants") return "연구과제 검색";
  if (view === "investment") return "투자 프로그램 검색";
  if (view === "global-research") return "글로벌 연구과제 검색";
  if (view === "trainee-fellowship") return "대학원·포닥 지원과제";
  if (view === "thesis-management") return "논문 작성 및 관리";
  return "지원 후보과제 관리";
}

function WorkspaceNavButton({
  active,
  icon,
  label,
  detail,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full grid-cols-[24px_1fr] items-start gap-3 rounded-md border px-3 py-3 text-left transition ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-transparent bg-white text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      <span className={active ? "mt-0.5 text-emerald-700" : "mt-0.5 text-zinc-500"}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{detail}</span>
      </span>
    </button>
  );
}

function ExternalNavLink({ link }: { link: ExternalWorkspaceLink }) {
  return (
    <a
      href={link.href}
      className="grid w-full grid-cols-[24px_1fr_16px] items-start gap-3 rounded-md border border-transparent bg-white px-3 py-3 text-left text-zinc-700 transition hover:border-zinc-200 hover:bg-zinc-50"
    >
      <Network className="mt-0.5 h-4 w-4 text-zinc-500" aria-hidden />
      <span>
        <span className="block text-sm font-semibold">{link.label}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{link.detail}</span>
      </span>
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 text-zinc-400" aria-hidden />
    </a>
  );
}
