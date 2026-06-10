import { getReportById } from "@/lib/db";
import { buildRis } from "@/lib/ris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const report = await getReportById(id);
  if (!report) {
    return new Response("Report not found", { status: 404 });
  }

  const ris = buildRis(report.items);
  return new Response(ris, {
    headers: {
      "Content-Type": "application/x-research-info-systems; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.id}.ris"`,
    },
  });
}
