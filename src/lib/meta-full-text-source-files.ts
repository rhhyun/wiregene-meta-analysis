import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  deleteGoogleDriveFile,
  getGoogleDriveFileMetadata,
  readBinaryFileFromGoogleDrive,
  writeBinaryFileToGoogleDrive,
} from "./google-drive-storage";
import {
  cleanMetaProjectId,
  metaProjectScopedDriveFileName,
  metaProjectScopedLocalPath,
} from "./meta-project-scope";

export type MetaFullTextSourceFileStorage = "local-file" | "google-drive";

export type MetaFullTextSourceFile = {
  storage: MetaFullTextSourceFileStorage;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  savedAt: string;
  localPath: string | null;
  driveFileId: string | null;
  webViewLink: string | null;
};

export type MetaFullTextSourceDeleteResult = {
  deleted: boolean;
  storage: MetaFullTextSourceFileStorage;
  warning: string | null;
};

const defaultSourceFileRoot = ".data/meta/full-text-files";

export function fullTextSourceSha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function saveMetaFullTextSourceFile(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  existingDriveFileId?: string | null;
  projectId?: string | null;
}): Promise<MetaFullTextSourceFile> {
  const sha256 = fullTextSourceSha256(input.buffer);
  const fileName = cleanFileName(input.fileName) || `full-text-${sha256.slice(0, 12)}`;
  const mimeType = input.mimeType?.trim() || "application/octet-stream";
  const fileSize = Number.isFinite(input.fileSize ?? Number.NaN) && (input.fileSize ?? 0) >= 0
    ? Math.floor(input.fileSize ?? 0)
    : input.buffer.byteLength;

  if (input.existingDriveFileId) {
    const metadata = await getGoogleDriveFileMetadata(input.existingDriveFileId);
    return {
      storage: "google-drive",
      fileName: metadata.name || fileName,
      mimeType: metadata.mimeType || mimeType,
      fileSize: parseDriveFileSize(metadata.size) ?? fileSize,
      sha256,
      savedAt: new Date().toISOString(),
      localPath: null,
      driveFileId: metadata.id,
      webViewLink: metadata.webViewLink ?? null,
    };
  }

  const storedFileName = storedSourceFileName(sha256, fileName);
  if (sourceStorageBackend() === "google-drive") {
    const driveName = sourceDriveFileName(storedFileName, input.projectId);
    const file = await writeBinaryFileToGoogleDrive(driveName, input.buffer, mimeType);
    return {
      storage: "google-drive",
      fileName,
      mimeType,
      fileSize,
      sha256,
      savedAt: new Date().toISOString(),
      localPath: null,
      driveFileId: file.id,
      webViewLink: file.webViewLink ?? null,
    };
  }

  const root = sourceFileRoot(input.projectId);
  const localPath = path.join(root, storedFileName);
  if (isServerlessRuntime()) {
    throw new Error(
      "Full-text source files cannot be saved to local storage in a read-only serverless deployment. Configure Google Drive storage or use Synology/local Docker.",
    );
  }

  await fs.mkdir(root, { recursive: true });
  let shouldWrite = true;
  try {
    const existing = await fs.readFile(localPath);
    shouldWrite = fullTextSourceSha256(existing) !== sha256;
  } catch {
    shouldWrite = true;
  }
  if (shouldWrite) {
    await fs.writeFile(localPath, input.buffer);
  }

  return {
    storage: "local-file",
    fileName,
    mimeType,
    fileSize,
    sha256,
    savedAt: new Date().toISOString(),
    localPath,
    driveFileId: null,
    webViewLink: null,
  };
}

export async function readMetaFullTextSourceFile(sourceFile: MetaFullTextSourceFile): Promise<Buffer> {
  if (sourceFile.storage === "google-drive") {
    if (!sourceFile.driveFileId) throw new Error("Saved full-text source is missing its Google Drive file id.");
    return readBinaryFileFromGoogleDrive(sourceFile.driveFileId);
  }

  if (!sourceFile.localPath) throw new Error("Saved full-text source is missing its local file path.");
  return fs.readFile(sourceFile.localPath);
}

export async function readVerifiedMetaFullTextSourceFile(sourceFile: MetaFullTextSourceFile): Promise<Buffer> {
  const buffer = await readMetaFullTextSourceFile(sourceFile);
  const expectedSha256 = cleanString(sourceFile.sha256);
  if (!expectedSha256) {
    throw new Error("Saved full-text source is missing its checksum. Reupload the article once to create a verified source record.");
  }
  const actualSha256 = fullTextSourceSha256(buffer);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      "Saved full-text source checksum mismatch. The stored source file may have been changed or corrupted; reupload the article before reanalysis.",
    );
  }
  return buffer;
}

export function normalizeMetaFullTextSourceFile(value: unknown): MetaFullTextSourceFile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<MetaFullTextSourceFile>;
  const storage = record.storage === "google-drive" ? "google-drive" : record.storage === "local-file" ? "local-file" : null;
  if (!storage) return null;
  return {
    storage,
    fileName: cleanString(record.fileName) || "full-text",
    mimeType: cleanString(record.mimeType) || "application/octet-stream",
    fileSize: Math.max(0, Number(record.fileSize) || 0),
    sha256: cleanString(record.sha256),
    savedAt: cleanString(record.savedAt) || new Date().toISOString(),
    localPath: cleanOptional(record.localPath),
    driveFileId: cleanOptional(record.driveFileId),
    webViewLink: cleanOptional(record.webViewLink),
  };
}

export async function deleteMetaFullTextSourceFile(
  sourceFile: MetaFullTextSourceFile,
  projectId?: string | null,
): Promise<MetaFullTextSourceDeleteResult> {
  const normalized = normalizeMetaFullTextSourceFile(sourceFile);
  if (!normalized) {
    return { deleted: false, storage: "local-file", warning: "No valid full-text source file metadata was available." };
  }

  if (normalized.storage === "google-drive") {
    if (!normalized.driveFileId) {
      return { deleted: false, storage: normalized.storage, warning: "Saved Google Drive source file id is missing." };
    }
    return {
      deleted: await deleteGoogleDriveFile(normalized.driveFileId),
      storage: normalized.storage,
      warning: null,
    };
  }

  if (!normalized.localPath) {
    return { deleted: false, storage: normalized.storage, warning: "Saved local source file path is missing." };
  }

  const targetPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), normalized.localPath);
  const allowedRoots = sourceFileAllowedRoots(projectId);
  const allowed = allowedRoots.some((root) => pathIsInsideOrSame(targetPath, root));
  if (!allowed) {
    return {
      deleted: false,
      storage: normalized.storage,
      warning: `Skipped local source file deletion outside configured full-text storage roots: ${normalized.localPath}`,
    };
  }

  try {
    await fs.unlink(targetPath);
    return { deleted: true, storage: normalized.storage, warning: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { deleted: false, storage: normalized.storage, warning: null };
    }
    throw error;
  }
}

function sourceStorageBackend(): MetaFullTextSourceFileStorage {
  const configured = process.env.META_FULL_TEXT_SOURCE_STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === "local-file" || configured === "local-files" || configured === "local-json") return "local-file";
  if (configured === "google-drive") return metaGoogleDriveStorageAllowed() ? "google-drive" : "local-file";
  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return "local-file";
}

function sourceFileRoot(projectId?: string | null) {
  const scopedProjectId = cleanMetaProjectId(projectId);
  if (scopedProjectId) return metaProjectScopedLocalPath(scopedProjectId, "full-text-files");

  const configured = process.env.META_FULL_TEXT_SOURCE_STORAGE_PATH?.trim();
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || defaultSourceFileRoot);
}

function sourceFileAllowedRoots(projectId?: string | null) {
  const roots = [sourceFileRoot(projectId), sourceFileRoot(null)]
    .map((root) => path.resolve(/* turbopackIgnore: true */ process.cwd(), root));
  return Array.from(new Set(roots));
}

function pathIsInsideOrSame(targetPath: string, rootPath: string) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function sourceDriveFileName(storedFileName: string, projectId?: string | null) {
  const scopedProjectId = cleanMetaProjectId(projectId);
  return scopedProjectId
    ? metaProjectScopedDriveFileName(scopedProjectId, `full-text-files__${storedFileName}`)
    : storedFileName;
}

function storedSourceFileName(sha256: string, fileName: string) {
  const extension = path.extname(fileName).slice(0, 16);
  const baseName = path.basename(fileName, extension).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return `${sha256.slice(0, 24)}-${baseName || "full-text"}${extension}`;
}

function cleanFileName(value: string) {
  return path.basename(cleanString(value)).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 240);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanOptional(value: unknown) {
  const normalized = cleanString(value);
  return normalized || null;
}

function parseDriveFileSize(value: string | undefined) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function metaGoogleDriveStorageAllowed() {
  if (isServerlessRuntime()) return true;
  const configured = (process.env.META_ALLOW_GOOGLE_DRIVE_STORAGE ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(configured);
}
