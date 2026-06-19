import crypto from "crypto";
import { appendFileSync } from "fs";
import {
  getGoogleDriveAuthMode,
} from "./google-drive-config";
import { refreshGoogleDriveOauthAccessToken } from "./google-drive-oauth";
import {
  googleServiceAccountJsonFromEnv,
  parseGoogleServiceAccountSecret,
} from "./google-service-account";
import type { ReportWithItems } from "./types";

const driveScope = "https://www.googleapis.com/auth/drive.file";
const tokenUrl = "https://oauth2.googleapis.com/token";
const driveFilesUrl = "https://www.googleapis.com/drive/v3/files";
const driveUploadUrl = "https://www.googleapis.com/upload/drive/v3/files";
const indexFileName = "research-briefing-index.json";
const defaultDatabaseFileName = "research-briefing-database.json";
const defaultFolderName = "Research Briefing Platform";
const folderMimeType = "application/vnd.google-apps.folder";

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
};

export type GoogleDriveTextFileSummary = Pick<
  DriveFile,
  "id" | "name" | "webViewLink" | "mimeType" | "size" | "modifiedTime"
>;

type DriveIndexEntry = {
  id: string;
  title: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  itemCount: number;
  driveFileId: string;
  webViewLink?: string;
};

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseServiceAccount() {
  const raw = googleServiceAccountJsonFromEnv();

  if (!raw) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is required.");
  }

  return parseGoogleServiceAccountSecret(raw);
}

async function getServiceAccountAccessToken() {
  const account = parseServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: driveScope,
    aud: account.token_uri ?? tokenUrl,
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claim),
  )}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedJwt)
    .sign(account.private_key.replace(/\\n/g, "\n"));
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch(account.token_uri ?? tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Google OAuth response did not include access_token.");
  return token.access_token;
}

async function getAccessToken() {
  const mode = getGoogleDriveAuthMode();
  if (mode === "oauth") return refreshGoogleDriveOauthAccessToken();
  if (mode === "service-account") return getServiceAccountAccessToken();

  throw new Error(
    [
      "Google Drive authentication is not configured.",
      "For personal Google Drive, set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN.",
      "For service accounts, set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON plus GOOGLE_DRIVE_FOLDER_ID or GOOGLE_DRIVE_DATABASE_FILE_ID.",
    ].join(" "),
  );
}

function parseDriveId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const folderMatch = trimmed.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];

  const idParamMatch = trimmed.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (idParamMatch?.[1]) return idParamMatch[1];

  return trimmed;
}

function folderId() {
  return parseDriveId(
    process.env.GOOGLE_DRIVE_FOLDER_ID ?? process.env.GOOGLE_DRIVE_FOLDER_URL ?? "",
  );
}

function folderName() {
  return process.env.GOOGLE_DRIVE_FOLDER_NAME ?? defaultFolderName;
}

function databaseFileName() {
  return process.env.GOOGLE_DRIVE_DATABASE_FILENAME ?? defaultDatabaseFileName;
}

function databaseFileId() {
  return process.env.GOOGLE_DRIVE_DATABASE_FILE_ID ?? process.env.GOOGLE_DRIVE_FILE_ID ?? "";
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  return fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

function driveQueryString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findDriveFile(query: string) {
  const url = new URL(driveFilesUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,mimeType,webViewLink)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await driveFetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Drive file lookup failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { files?: DriveFile[] };
  return payload.files?.[0] ?? null;
}

async function findFileByName(name: string) {
  const parent = await targetParentId();
  const parentQuery = parent ? `'${parent}' in parents and ` : "";
  const query = `${parentQuery}name = '${driveQueryString(name)}' and trashed = false`;
  return findDriveFile(query);
}

export async function listTextFilesFromGoogleDriveByNamePrefix(namePrefix: string): Promise<GoogleDriveTextFileSummary[]> {
  const parent = await targetParentId();
  const parentQuery = parent ? `'${parent}' in parents and ` : "";
  const files: GoogleDriveTextFileSummary[] = [];
  let pageToken = "";

  do {
    const url = new URL(driveFilesUrl);
    url.searchParams.set("q", `${parentQuery}name contains '${driveQueryString(namePrefix)}' and trashed = false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,webViewLink,modifiedTime)");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await driveFetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google Drive file list failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { files?: GoogleDriveTextFileSummary[]; nextPageToken?: string };
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken ?? "";
  } while (pageToken);

  return files.sort((left, right) => (right.modifiedTime ?? "").localeCompare(left.modifiedTime ?? ""));
}

async function targetParentId() {
  const explicitFolderId = folderId();
  if (explicitFolderId) return explicitFolderId;
  if (process.env.GOOGLE_DRIVE_USE_ROOT?.toLowerCase() === "true") return "";

  return ensureDefaultFolder();
}

async function ensureDefaultFolder() {
  const name = folderName();
  const existing = await findDriveFile(
    `mimeType = '${folderMimeType}' and name = '${driveQueryString(name)}' and trashed = false`,
  );
  if (existing) {
    logDriveFile("folder", existing);
    return existing.id;
  }

  const url = new URL(driveFilesUrl);
  url.searchParams.set("fields", "id,name,mimeType,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await driveFetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: folderMimeType,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Drive folder creation failed: ${response.status} ${await response.text()}`);
  }

  const folder = (await response.json()) as DriveFile;
  logDriveFile("folder", folder);
  return folder.id;
}

async function downloadText(fileId: string) {
  const url = new URL(`${driveFilesUrl}/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString());
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Google Drive download failed: ${response.status} ${await response.text()}`);
  }
  return response.text();
}

async function getJsonFile<T>(fileId: string, fallback: T) {
  const url = new URL(`${driveFilesUrl}/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString());
  if (response.status === 404) return fallback;
  if (!response.ok) {
    throw new Error(`Google Drive download failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function uploadJson(name: string, data: unknown, fileId?: string) {
  return uploadText(name, JSON.stringify(data, null, 2), fileId);
}

async function uploadText(name: string, contents: string, fileId?: string) {
  const boundary = `briefing-${crypto.randomUUID()}`;
  const parent = fileId ? "" : await targetParentId();
  const metadata = {
    name,
    parents: fileId || !parent ? undefined : [parent],
    mimeType: "application/json",
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    contents,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const url = new URL(fileId ? `${driveUploadUrl}/${fileId}` : driveUploadUrl);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,name,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString(), {
    method: fileId ? "PATCH" : "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google Drive upload failed: ${response.status} ${await response.text()}`);
  }

  const file = (await response.json()) as DriveFile;
  await shareRootFallbackFile(file);
  logDriveFile("file", file);
  return file;
}

async function uploadBinary(name: string, contents: Buffer, mimeType: string, fileId?: string) {
  const boundary = `briefing-${crypto.randomUUID()}`;
  const parent = fileId ? "" : await targetParentId();
  const metadata = {
    name,
    parents: fileId || !parent ? undefined : [parent],
    mimeType,
  };
  const body = Buffer.concat([
    Buffer.from(
      [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${mimeType || "application/octet-stream"}`,
        "",
        "",
      ].join("\r\n"),
      "utf8",
    ),
    contents,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  const url = new URL(fileId ? `${driveUploadUrl}/${fileId}` : driveUploadUrl);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString(), {
    method: fileId ? "PATCH" : "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google Drive binary upload failed: ${response.status} ${await response.text()}`);
  }

  const file = (await response.json()) as DriveFile;
  await shareRootFallbackFile(file);
  logDriveFile("file", file);
  return file;
}

function driveShareEmail() {
  return (process.env.GOOGLE_DRIVE_SHARE_EMAIL ?? "").trim();
}

async function shareRootFallbackFile(file: DriveFile) {
  if (folderId()) return;
  if (getGoogleDriveAuthMode() !== "oauth") return;

  const email = driveShareEmail();
  if (!email || !email.includes("@")) return;

  const response = await driveFetch(
    `${driveFilesUrl}/${file.id}/permissions?sendNotificationEmail=false`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress: email,
      }),
    },
  );

  if (!response.ok) {
    console.warn(
      `Google Drive file was saved, but sharing ${file.name} with ${email} failed: ${response.status} ${await response.text()}`,
    );
  }
}

function logDriveFile(kind: "file" | "folder", file: DriveFile) {
  const link = file.webViewLink ? ` link=${file.webViewLink}` : "";
  console.log(`Google Drive ${kind} saved: name=${file.name} id=${file.id}${link}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const label = kind === "folder" ? "Google Drive folder" : "Google Drive file";
  const target = file.webViewLink ? `[${file.name}](${file.webViewLink})` : file.name;
  appendFileSync(summaryPath, `\n- ${label}: ${target} (id: \`${file.id}\`)\n`, "utf8");
}

export async function readDatabaseTextFromGoogleDrive() {
  return readTextFileFromGoogleDrive(databaseFileName(), databaseFileId());
}

export async function writeDatabaseTextToGoogleDrive(contents: string) {
  await writeTextFileToGoogleDrive(databaseFileName(), contents, databaseFileId());
}

export async function readTextFileFromGoogleDrive(name: string, explicitFileId = "") {
  if (explicitFileId) return downloadText(explicitFileId);

  const file = await findFileByName(name);
  if (!file) return null;
  return downloadText(file.id);
}

export async function writeTextFileToGoogleDrive(name: string, contents: string, explicitFileId = "") {
  if (explicitFileId) {
    await uploadText(name, contents, explicitFileId);
    return;
  }

  const file = await findFileByName(name);
  await uploadText(name, contents, file?.id);
}

export async function writeBinaryFileToGoogleDrive(name: string, contents: Buffer, mimeType = "application/octet-stream", explicitFileId = "") {
  if (explicitFileId) {
    return uploadBinary(name, contents, mimeType, explicitFileId);
  }

  const file = await findFileByName(name);
  if (file) {
    const existing = await readBinaryFileFromGoogleDrive(file.id);
    if (existing.equals(contents)) return file;
    return uploadBinary(name, contents, mimeType, file.id);
  }
  return uploadBinary(name, contents, mimeType);
}

export async function createGoogleDriveResumableUploadSession(input: {
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}) {
  const parent = await targetParentId();
  const mimeType = input.mimeType?.trim() || "application/octet-stream";
  const metadata = {
    name: input.fileName.trim() || `full-text-${new Date().toISOString()}`,
    parents: parent ? [parent] : undefined,
    mimeType,
  };
  const url = new URL(driveUploadUrl);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");

  const headers: Record<string, string> = {
    "content-type": "application/json; charset=UTF-8",
    "x-upload-content-type": mimeType,
  };
  if (Number.isFinite(input.fileSize) && (input.fileSize ?? 0) > 0) {
    headers["x-upload-content-length"] = String(Math.floor(input.fileSize ?? 0));
  }

  const response = await driveFetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`Google Drive resumable upload session failed: ${response.status} ${await response.text()}`);
  }

  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new Error("Google Drive did not return a resumable upload URL.");
  return {
    uploadUrl,
    storage: "google-drive" as const,
  };
}

export async function getGoogleDriveFileMetadata(fileId: string) {
  const url = new URL(`${driveFilesUrl}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,size,webViewLink");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Drive metadata lookup failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as DriveFile;
}

export async function readBinaryFileFromGoogleDrive(fileId: string) {
  const url = new URL(`${driveFilesUrl}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Drive binary download failed: ${response.status} ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteGoogleDriveFile(fileId: string) {
  const normalizedFileId = fileId.trim();
  if (!normalizedFileId) return false;
  const url = new URL(`${driveFilesUrl}/${encodeURIComponent(normalizedFileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url.toString(), { method: "DELETE" });
  if (response.status === 404) return false;
  if (!response.ok && response.status !== 204) {
    throw new Error(`Google Drive file delete failed: ${response.status} ${await response.text()}`);
  }
  return true;
}

export async function saveReportToGoogleDrive(report: ReportWithItems) {
  const reportFile = await uploadJson(`report-${report.generatedAt.slice(0, 10)}-${report.id}.json`, report);
  const indexFile = await findFileByName(indexFileName);
  const currentIndex = indexFile
    ? await getJsonFile<{ reports: DriveIndexEntry[] }>(indexFile.id, { reports: [] })
    : { reports: [] };
  const nextEntry: DriveIndexEntry = {
    id: report.id,
    title: report.title,
    generatedAt: report.generatedAt,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    itemCount: report.items.length,
    driveFileId: reportFile.id,
    webViewLink: reportFile.webViewLink,
  };
  const reports = [
    nextEntry,
    ...currentIndex.reports.filter((entry) => entry.id !== report.id),
  ].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  await uploadJson(indexFileName, { reports }, indexFile?.id);
  return report;
}
