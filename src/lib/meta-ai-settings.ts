import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { config } from "./config";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import {
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";

export type MetaAiProviderType = "OPENAI" | "OPENAI_COMPATIBLE";

export type MetaAiReviewerSlotSummary = {
  id: string;
  label: string;
  providerType: MetaAiProviderType;
  enabled: boolean;
  modelName: string;
  baseUrl: string | null;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
};

export type MetaAiSettingsSummary = {
  providerType: "OPENAI";
  enabled: boolean;
  modelName: string;
  apiKeyMasked: string | null;
  apiKeySource: "saved" | "environment" | "missing";
  modelReviewers: MetaAiReviewerSlotSummary[];
  storageBackend: "local-json" | "google-drive";
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

export type MetaAiReviewerConfig = MetaAiReviewerSlotSummary & {
  apiKey: string;
};

type StoredMetaAiReviewerSlot = {
  id: string;
  label: string;
  providerType: MetaAiProviderType;
  enabled: boolean;
  modelName: string;
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
};

type StoredMetaAiSettings = {
  providerType: "OPENAI";
  enabled: boolean;
  modelName: string;
  apiKeyEncrypted: string | null;
  modelReviewers: StoredMetaAiReviewerSlot[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type ReviewerDefaultsInput = {
  apiKeyEncrypted: string | null;
  primaryModelName: string;
  primaryEnabled: boolean;
};

type MetaAiReviewerSlotUpdate = {
  id?: string;
  label?: string;
  providerType?: MetaAiProviderType;
  enabled?: boolean;
  modelName?: string;
  baseUrl?: string | null;
  apiKey?: string;
  clearApiKey?: boolean;
};

type MetaAiSettingsUpdate = {
  enabled?: boolean;
  modelName?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  modelReviewers?: MetaAiReviewerSlotUpdate[];
  updatedBy?: string | null;
};

type MetaAiSettingsStorageErrorDetails = {
  operation: "read" | "write" | "backup-corrupt-json";
  path: string;
  backend?: MetaAiSettingsSummary["storageBackend"];
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
const defaultDriveFileName = "meta-ai-settings.json";

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
    modelReviewers: normalizeReviewerSlotUpdates(input.modelReviewers, current, nextModel, apiKeyEncrypted),
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

export async function resolveMetaAiReviewerConfigs(): Promise<MetaAiReviewerConfig[]> {
  const settings = await readStoredMetaAiSettings();
  const primarySavedKey = decryptSecret(settings.apiKeyEncrypted);
  const primaryEnvKey = config.openaiApiKey.trim();
  const primaryApiKey = primarySavedKey || primaryEnvKey;
  return normalizeStoredReviewers(settings).map((slot, index) => {
    const savedKey = decryptSecret(slot.apiKeyEncrypted);
    const inheritsOpenAiKey = index === 0 || slot.providerType === "OPENAI" || looksLikeOpenAiModel(slot.modelName);
    const apiKey = savedKey || (inheritsOpenAiKey ? primaryApiKey : "");
    const apiKeySource: MetaAiSettingsSummary["apiKeySource"] = savedKey
      ? "saved"
      : apiKey
        ? primarySavedKey
          ? "saved"
          : "environment"
        : "missing";
    const baseUrl = normalizeBaseUrl(slot.baseUrl);
    const providerReady = slot.providerType === "OPENAI" || Boolean(baseUrl) || looksLikeOpenAiModel(slot.modelName);
    return {
      id: slot.id,
      label: slot.label,
      providerType: slot.providerType,
      enabled: slot.enabled && Boolean(apiKey) && providerReady,
      modelName: normalizeModelName(slot.modelName || config.openaiModel),
      baseUrl,
      apiKey,
      apiKeyMasked: maskSecret(apiKey),
      apiKeySource,
    };
  });
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

function metaAiSettingsStorageBackend(): MetaAiSettingsSummary["storageBackend"] {
  const configured = process.env.META_AI_SETTINGS_STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === "local-json") return configured;
  if (configured === "google-drive") return metaGoogleDriveStorageAllowed() ? "google-drive" : "local-json";
  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return "local-json";
}

function isGoogleDriveMetaAiStorage() {
  return metaAiSettingsStorageBackend() === "google-drive";
}

function metaAiSettingsDriveFileName() {
  const explicit = process.env.META_AI_SETTINGS_DRIVE_FILENAME?.trim();
  if (explicit) return explicit;

  const configuredPath = process.env.META_AI_SETTINGS_STORAGE_PATH?.trim();
  const baseName = path.basename(configuredPath || defaultStoragePath);
  return baseName || defaultDriveFileName;
}

function metaAiSettingsDriveFileId() {
  return process.env.META_AI_SETTINGS_DRIVE_FILE_ID?.trim() ?? "";
}

function metaAiSettingsStorageLocation() {
  return isGoogleDriveMetaAiStorage()
    ? `google-drive:${metaAiSettingsDriveFileName()}`
    : metaAiSettingsStoragePath();
}

async function readStoredMetaAiSettings(): Promise<StoredMetaAiSettings> {
  if (isGoogleDriveMetaAiStorage()) {
    const fileName = metaAiSettingsDriveFileName();
    const targetPath = `google-drive:${fileName}`;
    ensureGoogleDriveMetaAiStorageConfigured("read", fileName);

    let raw: string | null;
    try {
      raw = await readTextFileFromGoogleDrive(fileName, metaAiSettingsDriveFileId());
    } catch (error) {
      throw storageError(error, "read", targetPath);
    }

    if (!raw) return emptySettings();

    try {
      return normalizeStoredSettings(JSON.parse(raw));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw storageError(error, "read", targetPath);
      await moveCorruptGoogleDriveSettingsAside(fileName, raw, error);
      return emptySettings();
    }
  }

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
  if (isGoogleDriveMetaAiStorage()) {
    const fileName = metaAiSettingsDriveFileName();
    const targetPath = `google-drive:${fileName}`;
    ensureGoogleDriveMetaAiStorageConfigured("write", fileName);

    try {
      await writeTextFileToGoogleDrive(fileName, JSON.stringify(settings, null, 2), metaAiSettingsDriveFileId());
      return;
    } catch (error) {
      throw storageError(error, "write", targetPath);
    }
  }

  const targetPath = metaAiSettingsStoragePath();
  if (isServerlessReadOnlyPath(targetPath)) {
    throw new MetaAiSettingsStorageError("meta AI settings storage write failed.", {
      operation: "write",
      path: targetPath,
      backend: "local-json",
      code: "SERVERLESS_LOCAL_STORAGE",
      message: "The deployment filesystem is read-only, so Meta AI settings cannot be saved as a local JSON file.",
      help:
        "For Vercel, set META_AI_SETTINGS_STORAGE_BACKEND=google-drive with Google Drive credentials, or set OPENAI_API_KEY as a deployment environment variable. For Synology/local Docker, update and restart with scripts/synology-start-meta.sh.",
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

async function moveCorruptGoogleDriveSettingsAside(fileName: string, raw: string, parseError: SyntaxError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${fileName}.corrupt-${stamp}`;
  try {
    await writeTextFileToGoogleDrive(backupName, raw);
  } catch (error) {
    throw storageError(
      error,
      "backup-corrupt-json",
      `google-drive:${fileName}`,
      `google-drive:${backupName}`,
      parseError.message,
    );
  }
}

function toSummary(settings: StoredMetaAiSettings): MetaAiSettingsSummary {
  const savedKey = decryptSecret(settings.apiKeyEncrypted);
  const envKey = config.openaiApiKey.trim();
  const primaryKey = savedKey || envKey;
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
    modelReviewers: normalizeStoredReviewers(settings).map((slot, index) => {
      const slotSavedKey = decryptSecret(slot.apiKeyEncrypted);
      const inheritsOpenAiKey = index === 0 || slot.providerType === "OPENAI" || looksLikeOpenAiModel(slot.modelName);
      const slotKey = slotSavedKey || (inheritsOpenAiKey ? primaryKey : "");
      const slotSource: MetaAiSettingsSummary["apiKeySource"] = slotSavedKey
        ? "saved"
        : slotKey
          ? savedKey
            ? "saved"
            : "environment"
          : "missing";
      return {
        id: slot.id,
        label: slot.label,
        providerType: slot.providerType,
        enabled: slot.enabled,
        modelName: normalizeModelName(slot.modelName || config.openaiModel),
        baseUrl: normalizeBaseUrl(slot.baseUrl),
        apiKeyMasked: maskSecret(slotKey),
        apiKeySource: slotSource,
      };
    }),
    storageBackend: metaAiSettingsStorageBackend(),
    storagePath: metaAiSettingsStorageLocation(),
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

function emptySettings(): StoredMetaAiSettings {
  const enabled = Boolean(config.openaiApiKey.trim());
  return {
    providerType: "OPENAI",
    enabled,
    modelName: normalizeModelName(config.openaiModel || defaultModelName),
    apiKeyEncrypted: null,
    modelReviewers: defaultReviewerSlots({
      apiKeyEncrypted: null,
      primaryModelName: normalizeModelName(config.openaiModel || defaultModelName),
      primaryEnabled: enabled,
    }),
    updatedAt: null,
    updatedBy: null,
  };
}

function normalizeStoredSettings(value: unknown): StoredMetaAiSettings {
  if (!value || typeof value !== "object") return emptySettings();
  const record = value as Partial<StoredMetaAiSettings>;
  const enabled = typeof record.enabled === "boolean" ? record.enabled : Boolean(config.openaiApiKey.trim());
  const modelName = normalizeModelName(record.modelName || config.openaiModel || defaultModelName);
  const apiKeyEncrypted = typeof record.apiKeyEncrypted === "string" && record.apiKeyEncrypted ? record.apiKeyEncrypted : null;
  return {
    providerType: "OPENAI",
    enabled,
    modelName,
    apiKeyEncrypted,
    modelReviewers: normalizeStoredReviewers({
      enabled,
      modelName,
      apiKeyEncrypted,
      modelReviewers: Array.isArray(record.modelReviewers)
        ? (record.modelReviewers as StoredMetaAiReviewerSlot[])
        : [],
    }),
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : null,
    updatedBy: typeof record.updatedBy === "string" && record.updatedBy ? record.updatedBy : null,
  };
}

function defaultReviewerSlots({
  apiKeyEncrypted,
  primaryModelName,
  primaryEnabled,
}: ReviewerDefaultsInput): StoredMetaAiReviewerSlot[] {
  return [
    {
      id: "ai_reviewer_1",
      label: "AI reviewer 1",
      providerType: "OPENAI",
      enabled: primaryEnabled,
      modelName: normalizeModelName(primaryModelName || config.openaiModel || defaultModelName),
      baseUrl: null,
      apiKeyEncrypted,
    },
    {
      id: "ai_reviewer_2",
      label: "AI reviewer 2",
      providerType: "OPENAI_COMPATIBLE",
      enabled: false,
      modelName: "gpt-5-nano",
      baseUrl: null,
      apiKeyEncrypted: null,
    },
    {
      id: "ai_reviewer_3",
      label: "AI reviewer 3",
      providerType: "OPENAI_COMPATIBLE",
      enabled: false,
      modelName: "gemini-3.5-flash",
      baseUrl: null,
      apiKeyEncrypted: null,
    },
  ];
}

function normalizeStoredReviewers(
  settings: Pick<StoredMetaAiSettings, "enabled" | "modelName" | "apiKeyEncrypted" | "modelReviewers">,
): StoredMetaAiReviewerSlot[] {
  const defaults = defaultReviewerSlots({
    apiKeyEncrypted: settings.apiKeyEncrypted,
    primaryModelName: settings.modelName,
    primaryEnabled: settings.enabled,
  });
  const saved = Array.isArray(settings.modelReviewers) ? settings.modelReviewers : [];
  return defaults.map((fallback, index) => {
    const raw = saved.find((slot) => slot?.id === fallback.id) ?? saved[index];
    if (!raw || typeof raw !== "object") return fallback;
    return {
      id: cleanSlotId(raw.id, fallback.id),
      label: cleanSlotLabel(raw.label, fallback.label),
      providerType: raw.providerType === "OPENAI_COMPATIBLE" ? "OPENAI_COMPATIBLE" : "OPENAI",
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      modelName: normalizeModelName(raw.modelName || fallback.modelName),
      baseUrl: normalizeBaseUrl(raw.baseUrl),
      apiKeyEncrypted:
        typeof raw.apiKeyEncrypted === "string" && raw.apiKeyEncrypted ? raw.apiKeyEncrypted : fallback.apiKeyEncrypted,
    };
  });
}

function normalizeReviewerSlotUpdates(
  updates: MetaAiReviewerSlotUpdate[] | undefined,
  current: StoredMetaAiSettings,
  nextModel: string,
  primaryApiKeyEncrypted: string | null,
): StoredMetaAiReviewerSlot[] {
  const currentSlots = normalizeStoredReviewers({
    ...current,
    modelName: nextModel,
    apiKeyEncrypted: primaryApiKeyEncrypted,
  });
  if (!updates) {
    return currentSlots.map((slot, index) =>
      index === 0
        ? { ...slot, modelName: nextModel, apiKeyEncrypted: primaryApiKeyEncrypted }
        : slot,
    );
  }

  return currentSlots.map((slot, index) => {
    const update = updates.find((item) => item.id === slot.id) ?? updates[index];
    if (!update) return slot;
    const nextApiKey = update.apiKey?.trim();
    const apiKeyEncrypted = update.clearApiKey
      ? null
      : nextApiKey
        ? encryptSecret(nextApiKey)
        : slot.apiKeyEncrypted;
    const providerType: MetaAiProviderType =
      update.providerType === "OPENAI_COMPATIBLE" ? "OPENAI_COMPATIBLE" : "OPENAI";
    return {
      id: slot.id,
      label: cleanSlotLabel(update.label, slot.label),
      providerType,
      enabled: typeof update.enabled === "boolean" ? update.enabled : slot.enabled,
      modelName: normalizeModelName(update.modelName || slot.modelName),
      baseUrl: normalizeBaseUrl(update.baseUrl),
      apiKeyEncrypted,
    };
  });
}

function cleanSlotId(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").trim();
  return normalized || fallback;
}

function cleanSlotLabel(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 80) || fallback;
}

function normalizeBaseUrl(value: string | null | undefined) {
  const normalized = (value ?? "").trim().replace(/\/+$/, "");
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) return null;
  return normalized;
}

function normalizeModelName(value: string) {
  const normalized = value.replace(/\s+/g, "").trim();
  return normalizeKnownProviderModelAlias(normalized || defaultModelName);
}

function normalizeKnownProviderModelAlias(modelName: string) {
  const compact = modelName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact === "deepseekv4flash") return "deepseek-v4-flash";
  if (compact === "deepseekv4pro") return "deepseek-v4-pro";
  return modelName;
}

function looksLikeOpenAiModel(modelName: string) {
  return /^(gpt-|o\d|o-|chatgpt-|ft:)/i.test(modelName.trim());
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
  if (!isServerlessRuntime()) return false;
  if (targetPath === "/var/task" || targetPath.startsWith("/var/task/")) return true;
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function metaGoogleDriveStorageAllowed() {
  if (isServerlessRuntime()) return true;
  const configured = (process.env.META_ALLOW_GOOGLE_DRIVE_STORAGE ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(configured);
}

function ensureGoogleDriveMetaAiStorageConfigured(
  operation: MetaAiSettingsStorageErrorDetails["operation"],
  fileName: string,
) {
  if (getGoogleDriveAuthMode()) return;
  throw new MetaAiSettingsStorageError(`meta AI settings storage ${operation} failed.`, {
    operation,
    path: `google-drive:${fileName}`,
    backend: "google-drive",
    code: "GOOGLE_DRIVE_NOT_CONFIGURED",
    message:
      "Meta AI settings storage is set to google-drive, but Google Drive credentials are incomplete.",
    help:
      "Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN for OAuth storage, or set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON with GOOGLE_DRIVE_FOLDER_ID for service-account storage. As a fallback, set OPENAI_API_KEY directly in the deployment environment.",
  });
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
  const backend: MetaAiSettingsSummary["storageBackend"] = targetPath.startsWith("google-drive:")
    ? "google-drive"
    : "local-json";
  const help =
    backend === "google-drive"
      ? "Check Google Drive credentials and folder/file write permission. For Vercel, keep META_AI_SETTINGS_STORAGE_BACKEND=google-drive or set OPENAI_API_KEY directly."
      : operation === "write"
        ? "Check that the runtime user can write to this path. On Synology, the expected writable host folder is /volume1/docker/meta/data via the /app/.data/meta Docker volume."
        : "Check the Meta AI settings JSON file path and permissions.";

  return new MetaAiSettingsStorageError(`meta AI settings storage ${operation} failed.`, {
    operation,
    path: targetPath,
    backend,
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
