import { headers } from "next/headers";

import { GrantCandidateBoard } from "@/components/GrantCandidateBoard";
import { GovernmentGrantPanel } from "@/components/GovernmentGrantPanel";
import { MetaAnalysisApp } from "@/components/MetaAnalysisApp";
import { PlatformStatusPanel } from "@/components/PlatformStatusPanel";
import { PortalDashboard } from "@/components/PortalDashboard";
import { ReportLink } from "@/components/ReportView";
import { ResearchWorkspaceShell, type WorkspaceView } from "@/components/ResearchWorkspaceShell";
import { RunReportButton } from "@/components/RunReportButton";
import { ThesisManagementPanel } from "@/components/ThesisManagementPanel";
import { TopicBriefingExplorer } from "@/components/TopicBriefingExplorer";
import { TopicDesignerButton } from "@/components/TopicDesignerButton";
import { getWiregeneAppMode } from "@/lib/app-mode";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import { getEnabledTopics, getReportById, listReports } from "@/lib/db";
import { toOperationalError, type OperationalError } from "@/lib/operational-error";
import type { ReportWithItems, ResearchReport, TopicProfile } from "@/lib/types";
import { BRIEFING_VERSION_LABEL } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceViews: WorkspaceView[] = [
  "briefing",
  "central-grants",
  "investment",
  "global-research",
  "trainee-fellowship",
  "candidate-board",
  "thesis-management",
];

const externalLinks = [
  {
    label: "Meta-analysis",
    detail: "PRISMA, screening, extraction",
    href: "https://meta.wiregene.com/?wiregene_from=search",
  },
  {
    label: "Portal",
    detail: "ID management, platform login",
    href: "https://portal.wiregene.com/?wiregene_from=search",
  },
];

type DashboardState =
  | {
      ok: true;
      topics: TopicProfile[];
      reports: ResearchReport[];
      reportsWithItems: ReportWithItems[];
    }
  | {
      ok: false;
      error: OperationalError;
    };

async function loadDashboardState(): Promise<DashboardState> {
  const [topics, reports] = await Promise.all([getEnabledTopics(), listReports(8)]);
  const reportsWithItems = (
    await Promise.all(reports.map((report) => getReportById(report.id)))
  ).filter((report): report is ReportWithItems => Boolean(report));

  return {
    ok: true,
    topics,
    reports,
    reportsWithItems,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; view?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const initialSearchQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const requestHeaders = await headers();
  const appMode = getWiregeneAppMode(requestHeaders.get("host"));
  const currentUser = getCurrentWiregeneUser(requestHeaders.get("authorization"));

  if (appMode === "meta") {
    return (
      <MetaAnalysisApp
        initialSearchQuery={initialSearchQuery}
        versionLabel={BRIEFING_VERSION_LABEL}
        currentUser={currentUser}
      />
    );
  }

  if (appMode === "portal") {
    return <PortalDashboard versionLabel={BRIEFING_VERSION_LABEL} currentUser={currentUser} />;
  }

  const dashboard = await loadDashboardState().catch((error) => ({
    ok: false as const,
    error: toOperationalError(error),
  }));
  const topics = dashboard.ok ? dashboard.topics : [];
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const initialView = workspaceViews.find((view) => view === viewParam);

  return (
    <ResearchWorkspaceShell
      versionLabel={BRIEFING_VERSION_LABEL}
      initialView={initialView}
      currentUser={currentUser}
      briefingPanel={<BriefingPanel dashboard={dashboard} topics={topics} />}
      centralGrantPanel={<GovernmentGrantPanel topics={topics} sourceGroup="central" />}
      investmentPanel={<GovernmentGrantPanel topics={topics} sourceGroup="investment" />}
      globalResearchPanel={<GovernmentGrantPanel topics={topics} sourceGroup="global-research" />}
      traineeFellowshipPanel={<GovernmentGrantPanel topics={topics} sourceGroup="trainee-fellowship" />}
      candidatePanel={<GrantCandidateBoard />}
      thesisManagementPanel={<ThesisManagementPanel />}
      externalLinks={externalLinks}
    />
  );
}

function BriefingPanel({ dashboard, topics }: { dashboard: DashboardState; topics: TopicProfile[] }) {
  return (
    <div className="grid gap-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Paper & News Briefing</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              논문과 기사 자동 검색
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              PubMed 논문과 주요 뉴스를 검색하고, 요약, 저장, Zotero 전송까지 이어갑니다.
            </p>
          </div>
          <div className="grid gap-2 sm:min-w-80">
            <RunReportButton />
            {dashboard.ok ? <TopicDesignerButton initialTopics={topics} /> : null}
          </div>
        </div>
      </section>

      <PlatformStatusPanel topicCount={topics.length} />

      {dashboard.ok ? (
        <TopicBriefingExplorer topics={topics} reports={dashboard.reportsWithItems} />
      ) : (
        <DashboardErrorPanel error={dashboard.error} />
      )}

      {dashboard.ok && dashboard.reports.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-950">저장된 리포트</h2>
          {dashboard.reports.map((report) => (
            <ReportLink key={report.id} report={report} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function DashboardErrorPanel({ error }: { error: OperationalError }) {
  return (
    <section
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-950"
    >
      <p className="text-sm font-semibold text-rose-700">Configuration error</p>
      <h2 className="mt-1 text-xl font-semibold">{error.title}</h2>
      <p className="mt-3 text-sm leading-6">{error.message}</p>
      <p className="mt-3 text-sm font-medium leading-6">{error.action}</p>
    </section>
  );
}
