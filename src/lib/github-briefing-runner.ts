import { generateResearchReport } from "./report-generator";
import { validateGoogleDriveScheduledConfig } from "./google-drive-config";
import { sendResearchReportEmail } from "./email";
import { reportVersionLabel } from "./version";

function daysBack() {
  const value = Number(process.env.BRIEFING_DAYS_BACK ?? "7");
  return Number.isFinite(value) && value > 0 ? Math.min(365, Math.floor(value)) : 7;
}

function isGitHubActions() {
  return process.env.GITHUB_ACTIONS === "true";
}

function emitGitHubError(title: string, message: string) {
  if (!isGitHubActions()) return;
  console.error(`::error title=${title}::${message}`);
}

function assertGitHubDriveConfig() {
  if (!isGitHubActions()) return;

  const config = validateGoogleDriveScheduledConfig();
  for (const warning of config.warnings) {
    console.warn(warning);
  }

  if (!config.ok) {
    const issues = [...config.missing, ...config.failures];
    const message = `Missing or invalid GitHub Actions configuration: ${issues.join(", ")}`;
    emitGitHubError("Research briefing preflight failed", message);
    console.error(
      [
        message,
        "Open the GitHub repository, then go to Settings > Secrets and variables > Actions.",
        "For personal Google Drive, add GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN.",
        "Service-account JSON alone cannot write to a personal Drive root because service accounts do not have storage quota.",
        "The Node.js 20 deprecation annotation is only a warning; this preflight error is the reason the job failed.",
      ].join("\n"),
    );
    throw new Error(message);
  }

  console.log(
    `Research briefing preflight passed for Google Drive (${config.mode}) and NCBI configuration.`,
  );
}

async function main() {
  process.env.REPORT_STORAGE_BACKEND ||= "google-drive";
  assertGitHubDriveConfig();

  const report = await generateResearchReport(daysBack());
  const email = await sendResearchReportEmail(report);
  console.log(
    JSON.stringify(
      {
        ok: true,
        version: reportVersionLabel(report),
        reportId: report.id,
        generatedAt: report.generatedAt,
        itemCount: report.items.length,
        email,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  emitGitHubError("Research briefing generation failed", message);
  console.error(error);
  process.exitCode = 1;
});
