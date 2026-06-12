import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { config } from "./config";

export type MetaAiSettingsSummary = {
  providerType: "OPENAI";
  enabled: boolean;
  modelName: string;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
  storagePath: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type MetaOpenAIConfig = {
  apiKey: string;
  modelName: string;
  enabled: boolean;
  source: MetaAiSettingsSummary["apiKeySource"];
};

type StoredMetaAiSettings = {
  providerType: "OPENAI";
  enabled: boolean;
  modelName: string;
  apiKeyEncrypted: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type MetaAiSettingsUpdate = {
  enabled?: boolean;
  modelName?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  updatedBy?: string | null;
};

type MetaAiSettingsStorageErrorDetails = {
  operation: "read" | "write" | "backup-corrupt-json";
  path: string;
  code?: string;
  message: string;
  help: string;
  backupPath?: string;
};

export class MetaAiSettingsStorageError extends Error {
  readonly details: MetaAiSettingsStorageErrorDetails;

  constructor(message: string, details: MetaAiSettingsStorageErrorDetails) {
    super(message);
    this.name = "MetaAiSettingsStorageError";
    this.details = details;
  }
}

const defaultModelName = "gpt-5-nano";
const encryptionPrefix = "aesgcm:v1:";
const defaultStoragePath = ".data/meta/meta-ai-settings.json";

export async function getMetaAiSettingsSummary(): Promise<MetaAiSettingsSummary> {
  const settings = await readStoredMetaAiSettings();
  return toSummary(settings);
}

export async function updateMetaAiSettings(input: MetaAiSettingsUpdate): Promise<MetaAiSettingsSummary> {
  const current = await readStoredMetaAiSettings();
  const nextModel = normalizeModelName(input.modelName ?? current.modelName);
  let apiKeyEncrypted = current.apiKeyEncrypted;
  const nextApiKey = input.apiKey?.trim();

  if (input.clearApiKey) {
    apiKeyEncrypted = null;
  } else if (nextApiKey) {
    apiKeyEncrypted = encryptSecret(nextApiKey);
  }

  const next: StoredMetaAiSettings = {
    providerType: "OPENAI",
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    modelName: nextModel,
    apiKeyEncrypted,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy?.trim() || current.updatedBy || null,
  };

  await writeStoredMetaAiSettings(next);
  return toSummary(next);
}

export async function resolveMetaOpenAIConfig(): Promise<MetaOpenAIConfig> {
  const settings = await readStoredMetaAiSettings();
  const savedKey = decryptSecret(settings.apiKeyEncrypted);
  const envKey = config.openaiApiKey.trim();
  const apiKey = savedKey || envKey;
  const source: MetaOpenAIConfig["source"] = savedKey ? "saved" : envKey ? "environment" : "missing";

  return {
    apiKey: settings.enabled ? apiKey : "",
    modelName: normalizeModelName(settings.modelName || config.openaiModel),
    enabled: settings.enabled && Boolean(apiKey),
    source,
  };
}

export function metaAiSettingsErrorDetails(error: unknown) {
  if (error instanceof MetaAiSettingsStorageError) return error.details;
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function metaAiSettingsStoragePath() {
  const configured = process.env.META_AI_SETTINGS_STORAGE_PATH?.trim();
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || defaultStoragePath);
}

async function readStoredMetaAiSettings(): Promise<StoredMetaAiSettings> {
  const targetPath = metaAiSettingsStoragePath();
  let raw: string;

  try {
    raw = await fs.readFile(targetPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySettings();
    throw storageError(error, "read", targetPath);
  }

  try {
    return normalizeStoredSettings(JSON.parse(raw));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw storageError(error, "read", targetPath);
    await moveCorruptSettingsAside(targetPath, error);
    return emptySettings();
  }
}

async function writeStoredMetaAiSettings(settings: StoredMetaAiSettings) {
  const targetPath = metaAiSettingsStoragePath();
  if (isServerlessReadOnlyPath(targetPath)) {
    throw new MetaAiSettingsStorageError("meta AI settings storage write failed.", {
      operation: "write",
      path: targetPath,
      code: "SERVERLESS_LOCAL_STORAGE",
      message: "The deployment filesystem is read-only, so Meta AI settings cannot be saved as a local JSON file.",
      help:
        "Run Meta on Synology/local Docker for in-app key storage, or set OPENAI_API_KEY as a deployment environment variable. For Synology, update and restart with scripts/synology-start-meta.sh.",
    });
  }

  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(settings, null, 2), "utf8");
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw storageError(error, "write", targetPath);
  }
}

async function moveCorruptSettingsAside(targetPath: string, parseError: SyntaxError) {
  const backupPath = `${targetPath}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    await fs.rename(targetPath, backupPath);
  } catch (error) {
    throw storageError(error, "backup-corrupt-json", targetPath, backupPath, parseError.message);
  }
}

function toSummary(settings: StoredMetaAiSettings): MetaAiSettingsSummary {
  const savedKey = decryptSecret(settings.apiKeyEncrypted);
  const envKey = config.openaiApiKey.trim();
  const apiKeyMasked = maskSecret(savedKey) ?? maskSecret(envKey);
  const apiKeySource: MetaAiSettingsSummary["apiKeySource"] = savedKey
    ? "saved"
    : envKey
      ? "environment"
      : "missing";

  return {
    providerType: "OPENAI",
    enabled: settings.enabled,
    modelName: normalizeModelName(settings.modelName || config.openaiModel),
    apiKeyMasked,
    apiKeySource,
    storagePath: metaAiSettingsStoragePath(),
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

function emptySettings(): StoredMetaAiSettings {
  return {
    providerType: "OPENAI",
    enabled: Boolean(config.openaiApiKey.trim()),
    modelName: normalizeModelName(config.openaiModel || defaultModelName),
    apiKeyEncrypted: null,
    updatedAt: null,
    updatedBy: null,
  };
}

function normalizeStoredSettings(value: unknown): StoredMetaAiSettings {
  if (!value || typeof value !== "object") return emptySettings();
  const record = value as Partial<StoredMetaAiSettings>;
  return {
    providerType: "OPENAI",
    enabled: typeof record.enabled === "boolean" ? record.enabled : Boolean(config.openaiApiKey.trim()),
    modelName: normalizeModelName(record.modelName || config.openaiModel || defaultModelName),
    apiKeyEncrypted: typeof record.apiKeyEncrypted === "string" && record.apiKeyEncrypted ? record.apiKeyEncrypted : null,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : null,
    updatedBy: typeof record.updatedBy === "string" && record.updatedBy ? record.updatedBy : null,
  };
}

function normalizeModelName(value: string) {
  const normalized = value.replace(/\s+/g, "").trim();
  return normalized || defaultModelName;
}

function encryptSecret(value: string) {
  const seed = encryptionSeed();
  if (!seed) {
    throw new Error(
      "AI 설정 암호화 키가 없습니다. META_AI_SETTINGS_SECRET, WIREGENE_SECRET_KEY, PORTAL_AUTH_CHECK_SECRET, 또는 APP_BASIC_AUTH_PASSWORD 중 하나를 서버 환경변수로 설정해 주세요.",
    );
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(seed), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encryptionPrefix}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const seed = encryptionSeed();
  if (!seed || !value.startsWith(encryptionPrefix)) return null;

  try {
    const payload = Buffer.from(value.slice(encryptionPrefix.length), "base64url");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(seed), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function encryptionKey(seed: string) {
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptionSeed() {
  return (
    process.env.META_AI_SETTINGS_SECRET?.trim() ||
    process.env.WIREGENE_SECRET_KEY?.trim() ||
    process.env.PORTAL_AUTH_CHECK_SECRET?.trim() ||
    process.env.WIREGENE_AUTH_CHECK_SECRET?.trim() ||
    process.env.APP_BASIC_AUTH_PASSWORD?.trim() ||
    process.env.APP_BASIC_AUTH_USERS?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function isServerlessReadOnlyPath(targetPath: string) {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      targetPath === "/var/task" ||
      targetPath.startsWith("/var/task/"),
  );
}

function storageError(
  error: unknown,
  operation: MetaAiSettingsStorageErrorDetails["operation"],
  targetPath: string,
  backupPath?: string,
  cause?: string,
) {
  if (error instanceof MetaAiSettingsStorageError) return error;
  const nodeError = error as NodeJS.ErrnoException;
  const message = error instanceof Error ? error.message : String(error);
  const help =
    operation === "write"
      ? "Check that the runtime user can write to this path. On Synology, the expected writable host folder is /volume1/docker/meta/data via the /app/.data/meta Docker volume."
      : "Check the Meta AI settings JSON file path and permissions.";

  return new MetaAiSettingsStorageError(`meta AI settings storage ${operation} failed.`, {
    operation,
    path: targetPath,
    code: nodeError.code,
    message: cause ? `${message}; cause: ${cause}` : message,
    help,
    backupPath,
  });
}

function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 10) return "*".repeat(value.length);
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}
