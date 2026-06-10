import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReportView } from "@/components/ReportView";
import { getReportById } from "@/lib/db";
import { getWiregeneAppMode } from "@/lib/app-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const requestHeaders = await headers();
  if (getWiregeneAppMode(requestHeaders.get("host")) !== "search") notFound();

  const { id } = await params;
  const report = await getReportById(id);
  if (!report) notFound();

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-700 hover:text-zinc-950"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          대시보드
        </Link>
        <ReportView report={report} />
      </div>
    </main>
  );
}
