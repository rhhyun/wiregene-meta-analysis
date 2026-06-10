import { config } from "./config";
import { refreshGoogleDriveOauthAccessToken } from "./google-drive-oauth";
import { formatDate, formatDateTime } from "./format";
import { reportVersionLabel } from "./version";
import type { BriefingItem, ReportWithItems } from "./types";

const gmailSendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const defaultItemLimit = 12;

export function reportEmailRecipients() {
  return splitRecipients(process.env.BRIEFING_EMAIL_TO || config.ncbiEmail);
}

export async function sendResearchReportEmail(report: ReportWithItems) {
  const recipients = reportEmailRecipients();
  if (recipients.length === 0) {
    console.log("Research briefing email skipped: BRIEFING_EMAIL_TO and NCBI_EMAIL are empty.");
    return { sent: false, recipients: [] };
  }

  const accessToken = await refreshGoogleDriveOauthAccessToken();
  const subject = `[Research Briefing] ${report.periodStart} - ${report.periodEnd} (${report.items.length} items)`;
  const message = buildRawMessage({
    to: recipients,
    subject,
    body: buildEmailBody(report),
  });

  const response = await fetch(gmailSendUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw: message }),
  });

  if (!response.ok) {
    throw new Error(`Gmail report email send failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { id?: string };
  console.log(
    `Research briefing email sent to ${recipients.join(", ")}${payload.id ? ` (message id: ${payload.id})` : ""}.`,
  );
  return { sent: true, recipients, messageId: payload.id ?? null };
}

function buildEmailBody(report: ReportWithItems) {
  const dashboardUrl = config.appBaseUrl.replace(/\/$/, "");
  const reportUrl = dashboardUrl ? `${dashboardUrl}/reports/${report.id}` : "";
  const topItems = report.items.slice(0, defaultItemLimit).map(formatEmailItem).join("\n\n");

  const lines = [
    "Research Briefing",
    "",
    `Version: ${reportVersionLabel(report)}`,
    `Period: ${report.periodStart} - ${report.periodEnd}`,
    `Generated: ${formatDateTime(report.generatedAt)}`,
    `Items: ${report.items.length}`,
    reportUrl ? `Dashboard: ${reportUrl}` : "",
    "",
    "Summary",
    report.summary || "No summary generated.",
    "",
    `Top ${Math.min(report.items.length, defaultItemLimit)} items`,
    topItems || "No items found for this period.",
    "",
    "This email was sent by the scheduled Research Briefing workflow.",
  ];

  if (!reportUrl) {
    return lines.filter((line) => !line.startsWith("Dashboard:")).join("\n");
  }

  return lines.join("\n");
}

function formatEmailItem(item: BriefingItem, index: number) {
  const details = [
    item.sourceName,
    formatDate(item.publishedAt),
    item.importance,
    item.doi ? `DOI: ${item.doi}` : "",
    item.pmid ? `PMID: ${item.pmid}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `${index + 1}. [${item.kind}] ${item.title}`,
    details,
    item.summary ? `Summary: ${item.summary}` : item.snippet ? `Snippet: ${item.snippet}` : "",
    item.significance ? `Significance: ${item.significance}` : "",
    item.url,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRawMessage({
  to,
  subject,
  body,
}: {
  to: string[];
  subject: string;
  body: string;
}) {
  const fromName = process.env.BRIEFING_EMAIL_FROM_NAME || "Research Briefing Platform";
  const fromEmail = process.env.BRIEFING_EMAIL_FROM || config.ncbiEmail || to[0];
  const headers = [
    `To: ${to.join(", ")}`,
    `From: ${encodeMimeHeader(fromName)} <${fromEmail}>`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  return base64UrlEncode(`${headers.join("\r\n")}\r\n\r\n${body}`);
}

function splitRecipients(value: string) {
  return value
    .split(/[,\s;]+/)
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.includes("@"));
}

function encodeMimeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
