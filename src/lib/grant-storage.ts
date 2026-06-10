import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";

type GrantJsonStorageOptions<T> = {
  envName: string;
  defaultRelativePath: string;
  label: string;
  emptyData: () => T;
  normalize: (value: unknown) => T;
};

type GrantStorageErrorDetails = {
  label: string;
  operation: string;
  path: string;
  backend?: string;
  code?: string;
  message: string;
  cause?: string;
  backupPath?: string;
};

export class GrantStorageError extends Error {
  readonly details: GrantStorageErrorDetails;

  constructor(message: string, details: GrantStorageErrorDetails) {
    super(message);
    this.name = "GrantStorageError";
    this.details = details;
  }
}

export function resolveGrantStoragePath(envName: string, defaultRelativePath: string) {
  const configuredPath = process.env[envName]?.trim();
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    configuredPath || defaultRelativePath,
  );
}

function grantStorageBackend() {
  return (process.env.GRANT_STORAGE_BACKEND ?? process.env.REPORT_STORAGE_BACKEND ?? "local-json").toLowerCase();
}

function isGoogleDriveGrantStorage() {
  return grantStorageBackend() === "google-drive";
}

function grantDriveFileName(envName: string, defaultRelativePath: string) {
  const explicit = process.env[`${envName}_DRIVE_FILENAME`]?.trim();
  if (explicit) return explicit;

  const configuredPath = process.env[envName]?.trim();
  return path.basename(configuredPath || defaultRelativePath);
}

function grantDriveFileId(envName: string) {
  return process.env[`${envName}_DRIVE_FILE_ID`]?.trim() ?? "";
}

function isServerlessReadOnlyPath(targetPath: string) {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      targetPath === "/var/task" ||
      targetPath.startsWith("/var/task/"),
  );
}

export function grantStorageErrorDetails(error: unknown) {
  if (error instanceof GrantStorageError) return error.details;
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

export function createGrantJsonStorage<T>(options: GrantJsonStorageOptions<T>) {
  const filePath = () => resolveGrantStoragePath(options.envName, options.defaultRelativePath);
  const driveFileName = () => grantDriveFileName(options.envName, options.defaultRelativePath);
  const driveFileId = () => grantDriveFileId(options.envName);

  return {
    path: filePath,
    async read() {
      if (isGoogleDriveGrantStorage()) {
        const raw = await readGoogleDriveData(options.label, driveFileName(), driveFileId());
        if (!raw) return options.emptyData();
        return parseStoredJson(raw, options, async (error) => {
          await writeTextFileFromGoogleDriveBackup(driveFileName(), raw, error);
        });
      }

      const targetPath = filePath();
      let raw: string;

      try {
        raw = await fs.readFile(targetPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return options.emptyData();
        throw storageError(error, options.label, "read", targetPath);
      }

      return parseStoredJson(raw, options, (error) => moveCorruptJsonAside(options.label, targetPath, error));
    },
    async write(data: T) {
      if (isGoogleDriveGrantStorage()) {
        await writeGoogleDriveData(options.label, driveFileName(), JSON.stringify(data, null, 2), driveFileId());
        return;
      }

      const targetPath = filePath();
      const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;

      if (isServerlessReadOnlyPath(targetPath)) {
        throw new GrantStorageError(`${options.label} storage write failed.`, {
          label: options.label,
          operation: "write",
          path: targetPath,
          backend: grantStorageBackend(),
          code: "SERVERLESS_LOCAL_STORAGE",
          message:
            "Local JSON grant storage cannot write under /var/task. Set REPORT_STORAGE_BACKEND=google-drive or GRANT_STORAGE_BACKEND=google-drive in Vercel.",
        });
      }

      try {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
        await fs.rename(temporaryPath, targetPath);
      } catch (error) {
        await fs.unlink(temporaryPath).catch(() => undefined);
        throw storageError(error, options.label, "write", targetPath);
      }
    },
  };
}

async function parseStoredJson<T>(
  raw: string,
  options: GrantJsonStorageOptions<T>,
  backupCorrupt: (error: SyntaxError) => Promise<void>,
) {
  try {
    return options.normalize(JSON.parse(raw));
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw storageError(error, options.label, "normalize", storageLocation(options));
    }

    await backupCorrupt(error);
    return options.emptyData();
  }
}

function storageLocation(options: GrantJsonStorageOptions<unknown>) {
  return isGoogleDriveGrantStorage()
    ? `google-drive:${grantDriveFileName(options.envName, options.defaultRelativePath)}`
    : resolveGrantStoragePath(options.envName, options.defaultRelativePath);
}

async function readGoogleDriveData(label: string, fileName: string, fileId: string) {
  ensureGoogleDriveGrantStorageConfigured(label, fileName);
  try {
    return await readTextFileFromGoogleDrive(fileName, fileId);
  } catch (error) {
    throw storageError(error, label, "read", `google-drive:${fileName}`, { backend: "google-drive" });
  }
}

async function writeGoogleDriveData(label: string, fileName: string, contents: string, fileId: string) {
  ensureGoogleDriveGrantStorageConfigured(label, fileName);
  try {
    await writeTextFileToGoogleDrive(fileName, contents, fileId);
  } catch (error) {
    throw storageError(error, label, "write", `google-drive:${fileName}`, { backend: "google-drive" });
  }
}

async function writeTextFileFromGoogleDriveBackup(fileName: string, raw: string, parseError: SyntaxError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeTextFileToGoogleDrive(`${fileName}.corrupt-${stamp}`, raw).catch((error) => {
    throw storageError(error, "grant google drive", "backup-corrupt-json", `google-drive:${fileName}`, {
      backend: "google-drive",
      cause: parseError.message,
      backupPath: `google-drive:${fileName}.corrupt-${stamp}`,
    });
  });
}

function ensureGoogleDriveGrantStorageConfigured(label: string, fileName: string) {
  if (getGoogleDriveAuthMode()) return;
  throw new GrantStorageError(`${label} storage Google Drive configuration is incomplete.`, {
    label,
    operation: "configure",
    path: `google-drive:${fileName}`,
    backend: "google-drive",
    code: "GOOGLE_DRIVE_NOT_CONFIGURED",
    message:
      "Grant storage is set to google-drive, but Google Drive credentials are incomplete. Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN.",
  });
}

async function moveCorruptJsonAside(label: string, targetPath: string, parseError: SyntaxError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${targetPath}.corrupt-${stamp}`;

  try {
    await fs.rename(targetPath, backupPath);
  } catch (error) {
    throw storageError(error, label, "backup-corrupt-json", targetPath, {
      cause: parseError.message,
      backupPath,
    });
  }
}

function storageError(
  error: unknown,
  label: string,
  operation: string,
  targetPath: string,
  extra: Partial<GrantStorageErrorDetails> = {},
) {
  if (error instanceof GrantStorageError) return error;
  const nodeError = error as NodeJS.ErrnoException;
  const message = error instanceof Error ? error.message : String(error);

  return new GrantStorageError(`${label} storage ${operation} failed.`, {
    label,
    operation,
    path: targetPath,
    backend: grantStorageBackend(),
    code: nodeError.code,
    message,
    ...extra,
  });
}
