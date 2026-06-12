import crypto from "crypto";
import { config } from "./config";
import { createGrantJsonStorage } from "./grant-storage";

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

const defaultModelName = "gpt-5-nano";
const encryptionPrefix = "aesgcm:v1:";

const metaAiSettingsStorage = createGrantJsonStorage<StoredMetaAiSettings>({
  envName: "META_AI_SETTINGS_STORAGE_PATH",
  defaultRelativePath: ".data/meta/meta-ai-settings.json",
  label: "meta AI settings",
  emptyData: () => emptySettings(),
  normalize: normalizeStoredSettings,
});

export async function getMetaAiSettingsSummary(): Promise<MetaAiSettingsSummary> {
  const settings = await metaAiSettingsStorage.read();
  return toSummary(settings);
}

export async function updateMetaAiSettings(input: MetaAiSettingsUpdate): Promise<MetaAiSettingsSummary> {
  const current = await metaAiSettingsStorage.read();
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

  await metaAiSettingsStorage.write(next);
  return toSummary(next);
}

export async function resolveMetaOpenAIConfig(): Promise<MetaOpenAIConfig> {
  const settings = await metaAiSettingsStorage.read();
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
    storagePath: metaAiSettingsStorage.path(),
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

function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 10) return "*".repeat(value.length);
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}
