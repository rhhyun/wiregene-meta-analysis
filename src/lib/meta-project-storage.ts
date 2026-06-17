import type { Dirent } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  listTextFilesFromGoogleDriveByNamePrefix,
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";

const defaultProjectStorageRoot = ".data/meta/projects";
const defaultProjectDrivePrefix = "meta-projects";
const defaultUserProjectsFile = ".data/meta/user-study-projects.json";
const defaultUserProjectsDriveFileName = "meta-user-study-projects.json";
const projectWorkspaceStateFileName = "project-workspace-state.json";
const maxProjectTextFileBytes = 25 * 1024 * 1024;
const allowedTextFileExtensions = new Set([".csv", ".json", ".md", ".txt", ".tsv"]);

type MetaProjectStorageBackend = "local-json" | "google-drive";

export type MetaProjectFileSummary = {
  fileName: string;
  path: string;
  bytes: number;
  updatedAt: string;
  webViewLink?: string;
};

export type MetaProjectStorageSummary = {
  projectId: string;
  folderName: string;
  storageBackend: MetaProjectStorageBackend;
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
  storageBackend: MetaProjectStorageBackend;
};

export type MetaProjectWorkspaceState = {
  updatedAt?: string;
  protocolDraft?: unknown;
  searchImportRows?: unknown;
  queryOverrides?: unknown;
  selectedDatabases?: unknown;
  workbookBoard?: unknown;
};

type StoredMetaStudyProjectLike = {
  id?: string;
  title?: string;
  shortTitle?: string;
  visibility?: string;
  duplicateOf?: string;
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

export async function readStoredMetaStudyProjects<T extends StoredMetaStudyProjectLike>(): Promise<T[]> {
  const raw = await readUserProjectsStorageText();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<UserProjectFile>;
    if (!Array.isArray(parsed.projects)) return [];

    const projects = parsed.projects as T[];
    const deduped = dedupeProjects(projects);
    if (projectListSignature(projects) !== projectListSignature(deduped)) {
      await writeUserProjectsStorageText(
        JSON.stringify({ ...parsed, updatedAt: new Date().toISOString(), projects: deduped }, null, 2),
      ).catch((error) => {
        console.warn(
          `Meta study project storage duplicate cleanup could not be written back: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
    return deduped;
  } catch (error) {
    if (error instanceof SyntaxError) {
      await backupCorruptUserProjectsFile(raw, error);
      return [];
    }
    throw error;
  }
}

export async function writeStoredMetaStudyProjects<T extends StoredMetaStudyProjectLike>(projects: T[]): Promise<T[]> {
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
  const storageBackend = projectFileStorageBackend();
  const storageRoot = projectStorageRootForBackend(storageBackend);
  const projectPath =
    storageBackend === "google-drive"
      ? `${storageRoot}/${folderName}`
      : path.join(/*turbopackIgnore: true*/ storageRoot, folderName);
  const files =
    storageBackend === "google-drive"
      ? await listGoogleDriveProjectFiles(folderName)
      : await listLocalProjectFiles(projectPath);

  return {
    projectId,
    folderName,
    storageBackend,
    storageRoot,
    projectPath,
    synologyPathHint: storageBackend === "google-drive" ? null : synologyProjectPathHint(folderName),
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
  const storageBackend = projectFileStorageBackend();
  const storageRoot = projectStorageRootForBackend(storageBackend);
  const projectPath =
    storageBackend === "google-drive"
      ? `${storageRoot}/${folderName}`
      : path.join(/*turbopackIgnore: true*/ storageRoot, folderName);
  const fileName = safeProjectFileName(input.fileName);
  const targetPath =
    storageBackend === "google-drive"
      ? `google-drive:${projectDriveFileName(folderName, fileName)}`
      : path.join(/*turbopackIgnore: true*/ projectPath, fileName);
  const byteLength = Buffer.byteLength(input.contents, "utf8");
  const contents = input.contents.endsWith("\n") ? input.contents : `${input.contents}\n`;

  if (byteLength > maxProjectTextFileBytes) {
    throw new Error(
      `Project export is too large (${byteLength.toLocaleString()} bytes). The current project file API supports text exports up to ${maxProjectTextFileBytes.toLocaleString()} bytes.`,
    );
  }

  if (storageBackend === "google-drive") {
    ensureGoogleDriveProjectStorageConfigured("write");
    await writeTextFileToGoogleDrive(projectDriveFileName(folderName, fileName), contents);
    return {
      projectId: input.projectId,
      folderName,
      storageRoot,
      projectPath,
      synologyPathHint: null,
      storageBackend,
      fileName,
      path: targetPath,
      bytes: Buffer.byteLength(contents, "utf8"),
      updatedAt: new Date().toISOString(),
    };
  }

  if (isServerlessRuntime()) {
    throw new Error(
      "Project folder export cannot write to a read-only serverless filesystem. Use the Synology/local Docker deployment or configure a writable project storage backend.",
    );
  }

  await fs.mkdir(projectPath, { recursive: true });
  await writeTextFileAtomically(targetPath, contents);

  const stats = await fs.stat(targetPath);
  return {
    projectId: input.projectId,
    folderName,
    storageRoot,
    projectPath,
    synologyPathHint: synologyProjectPathHint(folderName),
    storageBackend,
    fileName,
    path: targetPath,
    bytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}

export async function readMetaProjectTextFile(projectId: string, fileName: string) {
  const folderName = safeProjectFolder(projectId);
  const safeFileName = safeProjectFileName(fileName);
  const storageBackend = projectFileStorageBackend();
  if (storageBackend === "google-drive") {
    ensureGoogleDriveProjectStorageConfigured("read");
    return readTextFileFromGoogleDrive(projectDriveFileName(folderName, safeFileName));
  }

  try {
    return await fs.readFile(path.join(/*turbopackIgnore: true*/ projectStorageRoot(), folderName, safeFileName), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readMetaProjectWorkspaceState(projectId: string): Promise<MetaProjectWorkspaceState> {
  const raw = await readMetaProjectTextFile(projectId, projectWorkspaceStateFileName);
  if (!raw) return {};

  try {
    return normalizeProjectWorkspaceState(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      await backupCorruptProjectWorkspaceState(projectId, raw, error);
      return {};
    }
    throw error;
  }
}

export async function writeMetaProjectWorkspaceState(
  projectId: string,
  patch: MetaProjectWorkspaceState,
  options: { merge?: boolean } = {},
) {
  const current = options.merge === false ? {} : await readMetaProjectWorkspaceState(projectId);
  const next = normalizeProjectWorkspaceState({
    ...current,
    ...normalizeProjectWorkspaceState(patch),
    updatedAt: new Date().toISOString(),
  });
  await saveMetaProjectTextFile({
    projectId,
    fileName: projectWorkspaceStateFileName,
    contents: JSON.stringify(next, null, 2),
  });
  return next;
}

function projectStorageRoot() {
  const configured = process.env.META_PROJECT_STORAGE_ROOT?.trim() || defaultProjectStorageRoot;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function projectStorageRootForBackend(storageBackend: MetaProjectStorageBackend) {
  return storageBackend === "google-drive" ? `google-drive:${projectDrivePrefix()}` : projectStorageRoot();
}

function projectFileStorageBackend(): MetaProjectStorageBackend {
  const configured = process.env.META_PROJECT_STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === "local-json" || configured === "google-drive") return configured;

  const inherited = (process.env.REPORT_STORAGE_BACKEND ?? "").trim().toLowerCase();
  if (inherited === "local-json" || inherited === "google-drive") return inherited;

  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return "local-json";
}

function projectDrivePrefix() {
  return (process.env.META_PROJECT_DRIVE_PREFIX?.trim() || defaultProjectDrivePrefix)
    .replace(/[/\\]+/g, "-")
    .replace(/^-+|-+$/g, "") || defaultProjectDrivePrefix;
}

function projectDriveFileName(folderName: string, fileName: string) {
  return `${projectDrivePrefix()}__${folderName}__${fileName}`;
}

function projectDriveFilePrefix(folderName: string) {
  return `${projectDrivePrefix()}__${folderName}__`;
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

function ensureGoogleDriveProjectStorageConfigured(operation: "read" | "write") {
  if (getGoogleDriveAuthMode()) return;
  throw new Error(
    [
      `Meta project storage ${operation} failed because Google Drive is not configured.`,
      "Set META_PROJECT_STORAGE_BACKEND=google-drive with GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN.",
      "For service-account storage, set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON with GOOGLE_DRIVE_FOLDER_ID.",
    ].join(" "),
  );
}

function dedupeProjects<T extends StoredMetaStudyProjectLike>(projects: T[]) {
  const seen = new Set<string>();
  const topicIndex = new Map<string, number>();
  const deduped: T[] = [];
  for (const project of projects) {
    const id = typeof project.id === "string" ? project.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const topicKey = storedProjectTopicKey(project);
    const existingIndex = topicIndex.get(topicKey);
    if (existingIndex !== undefined) {
      const existing = deduped[existingIndex];
      if (storedProjectVisibility(project) !== "active" && storedProjectVisibility(existing) === "active") {
        deduped[existingIndex] = {
          ...project,
          duplicateOf: existing.id,
        };
        seen.add(id);
      }
      continue;
    }
    seen.add(id);
    topicIndex.set(topicKey, deduped.length);
    deduped.push(project);
  }
  return deduped;
}

function storedProjectVisibility(project: StoredMetaStudyProjectLike) {
  return project.visibility === "archived" || project.visibility === "deleted" ? project.visibility : "active";
}

function storedProjectTopicKey(project: StoredMetaStudyProjectLike) {
  const title = normalizeStoredProjectTitle(project.title || project.shortTitle || "");
  if (!title || title === "untitled meta analysis topic") return `id:${project.id ?? ""}`;
  return `title:${title}`;
}

function normalizeStoredProjectTitle(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\W_]+/g, " ")
    .trim();
}

function projectListSignature(projects: StoredMetaStudyProjectLike[]) {
  return JSON.stringify(
    projects.map((project) => ({
      id: project.id ?? "",
      title: normalizeStoredProjectTitle(project.title || project.shortTitle || ""),
      visibility: storedProjectVisibility(project),
      duplicateOf: project.duplicateOf ?? "",
    })),
  );
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

async function listGoogleDriveProjectFiles(folderName: string) {
  ensureGoogleDriveProjectStorageConfigured("read");
  const prefix = projectDriveFilePrefix(folderName);
  const files = await listTextFilesFromGoogleDriveByNamePrefix(prefix);
  return files
    .filter((file) => file.name.startsWith(prefix))
    .map((file) => ({
      fileName: file.name.slice(prefix.length),
      path: `google-drive:${file.name}`,
      bytes: Number(file.size ?? 0),
      updatedAt: file.modifiedTime ?? new Date().toISOString(),
      webViewLink: file.webViewLink,
    }));
}

async function listLocalProjectFiles(projectPath: string) {
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

async function backupCorruptProjectWorkspaceState(projectId: string, raw: string, parseError: SyntaxError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    await saveMetaProjectTextFile({
      projectId,
      fileName: `project-workspace-state.corrupt-${stamp}.json`,
      contents: raw,
    });
  } catch (error) {
    throw new Error(`Meta project workspace state backup failed: ${error instanceof Error ? error.message : String(error)}; cause: ${parseError.message}`);
  }
}

function normalizeProjectWorkspaceState(value: unknown): MetaProjectWorkspaceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const state: MetaProjectWorkspaceState = {};
  if (typeof record.updatedAt === "string") state.updatedAt = record.updatedAt;
  if (record.protocolDraft !== undefined) state.protocolDraft = record.protocolDraft;
  if (record.searchImportRows !== undefined) state.searchImportRows = record.searchImportRows;
  if (record.queryOverrides !== undefined) state.queryOverrides = record.queryOverrides;
  if (record.selectedDatabases !== undefined) state.selectedDatabases = record.selectedDatabases;
  if (record.workbookBoard !== undefined) state.workbookBoard = record.workbookBoard;
  return state;
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
