import type { Dirent } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";

const defaultProjectStorageRoot = ".data/meta/projects";
const defaultUserProjectsFile = ".data/meta/user-study-projects.json";
const defaultUserProjectsDriveFileName = "meta-user-study-projects.json";
const maxProjectTextFileBytes = 25 * 1024 * 1024;
const allowedTextFileExtensions = new Set([".csv", ".json", ".md", ".txt", ".tsv"]);

export type MetaProjectFileSummary = {
  fileName: string;
  path: string;
  bytes: number;
  updatedAt: string;
};

export type MetaProjectStorageSummary = {
  projectId: string;
  folderName: string;
  storageRoot: string;
  projectPath: string;
  synologyPathHint: string | null;
  exists: boolean;
  files: MetaProjectFileSummary[];
};

export type MetaProjectSavedFile = MetaProjectFileSummary & {
  projectId: string;
  folderName: string;
  storageRoot: string;
  projectPath: string;
  synologyPathHint: string | null;
};

type UserProjectFile = {
  projects: unknown[];
  updatedAt?: string;
};

type MetaUserProjectsStorageBackend = "local-json" | "google-drive";

export type MetaUserProjectsStorageSummary = {
  backend: MetaUserProjectsStorageBackend;
  path: string;
};

export async function readStoredMetaStudyProjects<T>(): Promise<T[]> {
  const raw = await readUserProjectsStorageText();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<UserProjectFile>;
    return Array.isArray(parsed.projects) ? (parsed.projects as T[]) : [];
  } catch (error) {
    if (error instanceof SyntaxError) {
      await backupCorruptUserProjectsFile(raw, error);
      return [];
    }
    throw error;
  }
}

export async function writeStoredMetaStudyProjects<T extends { id?: string }>(projects: T[]): Promise<T[]> {
  const normalized = dedupeProjects(projects).slice(0, 30);
  await writeUserProjectsStorageText(JSON.stringify({ updatedAt: new Date().toISOString(), projects: normalized }, null, 2));
  return normalized;
}

export function getMetaUserProjectsStorageSummary(): MetaUserProjectsStorageSummary {
  return {
    backend: userProjectsStorageBackend(),
    path: userProjectsStorageLocation(),
  };
}

export async function getMetaProjectStorageSummary(projectId: string): Promise<MetaProjectStorageSummary> {
  const folderName = safeProjectFolder(projectId);
  const storageRoot = projectStorageRoot();
  const projectPath = path.join(/*turbopackIgnore: true*/ storageRoot, folderName);
  const files = await listProjectFiles(projectPath);

  return {
    projectId,
    folderName,
    storageRoot,
    projectPath,
    synologyPathHint: synologyProjectPathHint(folderName),
    exists: files !== null,
    files: files ?? [],
  };
}

export async function saveMetaProjectTextFile(input: {
  projectId: string;
  fileName: string;
  contents: string;
}): Promise<MetaProjectSavedFile> {
  const folderName = safeProjectFolder(input.projectId);
  const storageRoot = projectStorageRoot();
  const projectPath = path.join(/*turbopackIgnore: true*/ storageRoot, folderName);
  const fileName = safeProjectFileName(input.fileName);
  const targetPath = path.join(/*turbopackIgnore: true*/ projectPath, fileName);
  const byteLength = Buffer.byteLength(input.contents, "utf8");

  if (byteLength > maxProjectTextFileBytes) {
    throw new Error(
      `Project export is too large (${byteLength.toLocaleString()} bytes). The current project file API supports text exports up to ${maxProjectTextFileBytes.toLocaleString()} bytes.`,
    );
  }

  if (isServerlessRuntime()) {
    throw new Error(
      "Project folder export cannot write to a read-only serverless filesystem. Use the Synology/local Docker deployment or configure a writable project storage backend.",
    );
  }

  await fs.mkdir(projectPath, { recursive: true });
  await writeTextFileAtomically(targetPath, input.contents.endsWith("\n") ? input.contents : `${input.contents}\n`);

  const stats = await fs.stat(targetPath);
  return {
    projectId: input.projectId,
    folderName,
    storageRoot,
    projectPath,
    synologyPathHint: synologyProjectPathHint(folderName),
    fileName,
    path: targetPath,
    bytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}

function projectStorageRoot() {
  const configured = process.env.META_PROJECT_STORAGE_ROOT?.trim() || defaultProjectStorageRoot;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function userProjectsFilePath() {
  const configured = process.env.META_USER_PROJECTS_FILE?.trim() || defaultUserProjectsFile;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function userProjectsStorageBackend(): MetaUserProjectsStorageBackend {
  const configured = process.env.META_USER_PROJECTS_STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === "local-json" || configured === "google-drive") return configured;

  const inherited = (process.env.META_PROJECT_STORAGE_BACKEND ?? process.env.REPORT_STORAGE_BACKEND ?? "").trim().toLowerCase();
  if (inherited === "local-json" || inherited === "google-drive") return inherited;

  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return "local-json";
}

function userProjectsDriveFileName() {
  return (
    process.env.META_USER_PROJECTS_DRIVE_FILENAME?.trim() ||
    path.basename(process.env.META_USER_PROJECTS_FILE?.trim() || defaultUserProjectsFile) ||
    defaultUserProjectsDriveFileName
  );
}

function userProjectsDriveFileId() {
  return process.env.META_USER_PROJECTS_DRIVE_FILE_ID?.trim() ?? "";
}

function userProjectsStorageLocation() {
  return userProjectsStorageBackend() === "google-drive" ? `google-drive:${userProjectsDriveFileName()}` : userProjectsFilePath();
}

async function readUserProjectsStorageText() {
  if (userProjectsStorageBackend() === "google-drive") {
    ensureGoogleDriveUserProjectsStorageConfigured("read");
    return readTextFileFromGoogleDrive(userProjectsDriveFileName(), userProjectsDriveFileId());
  }

  try {
    return await fs.readFile(userProjectsFilePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeUserProjectsStorageText(contents: string) {
  if (userProjectsStorageBackend() === "google-drive") {
    ensureGoogleDriveUserProjectsStorageConfigured("write");
    await writeTextFileToGoogleDrive(userProjectsDriveFileName(), contents, userProjectsDriveFileId());
    return;
  }

  const filePath = userProjectsFilePath();
  if (isServerlessRuntime()) {
    throw new Error(
      "Meta study project storage cannot write to a read-only serverless filesystem. Set META_USER_PROJECTS_STORAGE_BACKEND=google-drive with Google Drive credentials, or run the app on Synology/local Docker with a writable data volume.",
    );
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeTextFileAtomically(filePath, contents);
}

async function backupCorruptUserProjectsFile(raw: string, parseError: SyntaxError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (userProjectsStorageBackend() === "google-drive") {
    const backupName = `${userProjectsDriveFileName()}.corrupt-${stamp}`;
    try {
      await writeTextFileToGoogleDrive(backupName, raw);
      return;
    } catch (error) {
      throw new Error(`Meta study project storage backup failed: ${error instanceof Error ? error.message : String(error)}; cause: ${parseError.message}`);
    }
  }

  const filePath = userProjectsFilePath();
  const backupPath = `${filePath}.corrupt-${stamp}`;
  try {
    await fs.rename(filePath, backupPath);
  } catch (error) {
    throw new Error(`Meta study project storage corrupt backup failed: ${error instanceof Error ? error.message : String(error)}; cause: ${parseError.message}`);
  }
}

function ensureGoogleDriveUserProjectsStorageConfigured(operation: "read" | "write") {
  if (getGoogleDriveAuthMode()) return;
  throw new Error(
    [
      `Meta study project storage ${operation} failed because Google Drive is not configured.`,
      "Set META_USER_PROJECTS_STORAGE_BACKEND=google-drive with GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN.",
      "For service-account storage, set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON with GOOGLE_DRIVE_FOLDER_ID.",
    ].join(" "),
  );
}

function dedupeProjects<T extends { id?: string }>(projects: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const project of projects) {
    const id = typeof project.id === "string" ? project.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(project);
  }
  return deduped;
}

function safeProjectFolder(projectId: string) {
  const cleaned = projectId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return cleaned || "project";
}

function safeProjectFileName(fileName: string) {
  const baseName = path.basename(fileName.trim()).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  if (!baseName || baseName === "." || baseName === "..") throw new Error("A valid file name is required.");
  const extension = path.extname(baseName).toLowerCase();
  if (!allowedTextFileExtensions.has(extension)) {
    throw new Error("Only .csv, .tsv, .txt, .md, and .json project exports are allowed.");
  }
  return baseName;
}

async function listProjectFiles(projectPath: string) {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(projectPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(/*turbopackIgnore: true*/ projectPath, entry.name);
        const stats = await fs.stat(filePath);
        return {
          fileName: entry.name,
          path: filePath,
          bytes: stats.size,
          updatedAt: stats.mtime.toISOString(),
        };
      }),
  );

  return files.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function writeTextFileAtomically(targetPath: string, contents: string) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, contents, "utf8");
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function synologyProjectPathHint(folderName: string) {
  const configured = process.env.META_PROJECT_STORAGE_ROOT?.trim();
  if (configured && configured !== defaultProjectStorageRoot) return null;
  return `/volume1/docker/meta/data/projects/${folderName}`;
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
