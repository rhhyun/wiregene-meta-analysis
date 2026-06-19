import type { ResearchReport } from "./types";

const INITIAL_BRIEFING_VERSION = "0.1";
const COPYRIGHT_NOTICE = "2026 copyright by JK Hyun";

export const BRIEFING_VERSION = "1.92";
export const BRIEFING_VERSION_LABEL = formatVersionLabel(BRIEFING_VERSION);

function formatVersionLabel(version: string) {
  return `Ver ${version} | ${COPYRIGHT_NOTICE}`;
}

export function reportVersionLabel(report: Pick<ResearchReport, "raw">) {
  const raw = report.raw;
  if (typeof raw === "object" && raw !== null) {
    const version = (raw as Record<string, unknown>).briefingVersion;
    if (typeof version === "string" && version.trim()) {
      return formatVersionLabel(version);
    }
  }

  return formatVersionLabel(INITIAL_BRIEFING_VERSION);
}
