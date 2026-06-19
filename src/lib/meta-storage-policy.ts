import { getGoogleDriveAuthMode } from "./google-drive-config";
import { BRIEFING_VERSION_LABEL } from "./version";

export type MetaJsonStorageBackend = "local-json" | "google-drive";
export type MetaSourceFileStorageBackend = "local-file" | "google-drive";

const truthyValues = new Set(["1", "true", "yes", "on"]);

export function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function metaGoogleDriveStorageAllowed() {
  if (isServerlessRuntime()) return true;
  return truthyValues.has((process.env.META_ALLOW_GOOGLE_DRIVE_STORAGE ?? "").trim().toLowerCase());
}

export function resolveMetaJsonStorageBackend(input: {
  configured?: string | null;
  inherited?: string | null;
  defaultBackend?: MetaJsonStorageBackend;
} = {}): MetaJsonStorageBackend {
  const configured = normalizeJsonBackend(input.configured);
  if (configured === "local-json") return "local-json";
  if (configured === "google-drive") return metaGoogleDriveStorageAllowed() ? "google-drive" : "local-json";

  const inherited = normalizeJsonBackend(input.inherited);
  if (inherited === "local-json") return "local-json";
  if (inherited === "google-drive") return metaGoogleDriveStorageAllowed() ? "google-drive" : "local-json";

  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return input.defaultBackend ?? "local-json";
}

export function resolveMetaSourceFileStorageBackend(configuredValue?: string | null): MetaSourceFileStorageBackend {
  const configured = (configuredValue ?? "").trim().toLowerCase();
  if (configured === "local-file" || configured === "local-files" || configured === "local-json") return "local-file";
  if (configured === "google-drive") return metaGoogleDriveStorageAllowed() ? "google-drive" : "local-file";
  if (isServerlessRuntime() && getGoogleDriveAuthMode()) return "google-drive";
  return "local-file";
}

export function isRecoverableGoogleDriveStorageError(error: unknown) {
  return /Google OAuth|invalid_grant|invalid_client|google-drive|Google Drive/i.test(errorMessage(error));
}

export function googleDriveFallbackWarning(error: unknown) {
  return `Google Drive storage is unavailable, so Meta is using local storage fallback for this request. ${sanitizeStorageErrorMessage(error)}`;
}

export function isGoogleOauthStorageProblem(error: unknown) {
  return isRecoverableGoogleDriveStorageError(error);
}

export function storageFallbackNotice(action: string) {
  return `${action}: Google Drive storage is unavailable, so this screen is staying in browser/local fallback mode. Run the Synology restart command to force Meta storage back to local Docker.`;
}

export function metaStoragePolicySummary() {
  const projectBackend = resolveMetaJsonStorageBackend({
    configured: process.env.META_PROJECT_STORAGE_BACKEND,
  });
  const userProjectsBackend = resolveMetaJsonStorageBackend({
    configured: process.env.META_USER_PROJECTS_STORAGE_BACKEND,
    inherited: process.env.META_PROJECT_STORAGE_BACKEND,
  });
  const aiSettingsBackend = resolveMetaJsonStorageBackend({
    configured: process.env.META_AI_SETTINGS_STORAGE_BACKEND,
  });
  const fullTextHistoryBackend = resolveMetaJsonStorageBackend({
    configured: process.env.META_FULL_TEXT_HISTORY_STORAGE_BACKEND,
    inherited: process.env.META_PROJECT_STORAGE_BACKEND,
  });
  const fullTextSourceBackend = resolveMetaSourceFileStorageBackend(process.env.META_FULL_TEXT_SOURCE_STORAGE_BACKEND);

  return {
    version: BRIEFING_VERSION_LABEL,
    runtime: isServerlessRuntime() ? "serverless" : "local-node",
    googleDriveAuthConfigured: Boolean(getGoogleDriveAuthMode()),
    googleDriveStorageAllowed: metaGoogleDriveStorageAllowed(),
    backends: {
      project: projectBackend,
      userProjects: userProjectsBackend,
      aiSettings: aiSettingsBackend,
      fullTextHistory: fullTextHistoryBackend,
      fullTextSource: fullTextSourceBackend,
    },
    environment: {
      META_ALLOW_GOOGLE_DRIVE_STORAGE: safeEnvValue(process.env.META_ALLOW_GOOGLE_DRIVE_STORAGE),
      META_PROJECT_STORAGE_BACKEND: safeEnvValue(process.env.META_PROJECT_STORAGE_BACKEND),
      META_USER_PROJECTS_STORAGE_BACKEND: safeEnvValue(process.env.META_USER_PROJECTS_STORAGE_BACKEND),
      META_AI_SETTINGS_STORAGE_BACKEND: safeEnvValue(process.env.META_AI_SETTINGS_STORAGE_BACKEND),
      META_FULL_TEXT_HISTORY_STORAGE_BACKEND: safeEnvValue(process.env.META_FULL_TEXT_HISTORY_STORAGE_BACKEND),
      META_FULL_TEXT_SOURCE_STORAGE_BACKEND: safeEnvValue(process.env.META_FULL_TEXT_SOURCE_STORAGE_BACKEND),
      REPORT_STORAGE_BACKEND: safeEnvValue(process.env.REPORT_STORAGE_BACKEND),
    },
  };
}

function normalizeJsonBackend(value?: string | null): MetaJsonStorageBackend | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "local-json") return "local-json";
  if (normalized === "google-drive") return "google-drive";
  return null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeStorageErrorMessage(error: unknown) {
  return errorMessage(error).replace(/\s+/g, " ").trim().slice(0, 600);
}

function safeEnvValue(value: string | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  if (/secret|token|key/i.test(normalized)) return "[set]";
  return normalized;
}
