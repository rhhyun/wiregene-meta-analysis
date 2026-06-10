import { generateResearchReportWithStorage } from "./report-generator";
import { getReportStorageAdapter } from "./storage";
import { reportVersionLabel } from "./version";
import type { ReportWithItems } from "./types";

function daysBack() {
  const value = Number(process.env.BRIEFING_DAYS_BACK ?? "7");
  return Number.isFinite(value) && value > 0 ? Math.min(365, Math.floor(value)) : 7;
}

async function main() {
  process.env.REPORT_STORAGE_BACKEND ||= "local-json";
  process.env.REPORT_STORAGE_LOCAL_PATH ||= ".data/research-briefing-storage.json";
  process.env.NCBI_TOOL ||= "research-briefing-platform";

  const storage = getReportStorageAdapter();
  await storage.ensure();
  await storage.seedDefaultTopics();

  const report = await generateResearchReportWithStorage(
    (candidate: ReportWithItems) => storage.saveReport(candidate, candidate.items),
    daysBack(),
    () => storage.getEnabledTopics(),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        runner: "synology",
        storage: process.env.REPORT_STORAGE_BACKEND,
        version: reportVersionLabel(report),
        reportId: report.id,
        generatedAt: report.generatedAt,
        itemCount: report.items.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
