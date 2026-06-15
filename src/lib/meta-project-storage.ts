import type { Dirent } from "fs";
import { promises as fs } from "fs";
import path from "path";

const defaultProjectStorageRoot = ".data/meta/projects";
const defaultUserProjectsFile = ".data/meta/user-study-projects.json";
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

export async function readStoredMetaStudyProjects<T>(): Promise<T[]> {
  const filePath = userProjectsFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserProjectFile>;
    return Array.isArray(parsed.projects) ? (parsed.projects as T[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeStoredMetaStudyProjects<T extends { id?: string }>(projects: T[]): Promise<T[]> {
  if (isServerlessRuntime()) {
    throw new Error(
      "Meta study project storage cannot write to a read-only serverless filesystem. Use the Synology/local Docker deployment or configure a writable project storage backend.",
    );
  }

  const normalized = dedupeProjects(projects).slice(0, 30);
  const filePath = userProjectsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeTextFileAtomically(
    filePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), projects: normalized }, null, 2),
  );
  return normalized;
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
