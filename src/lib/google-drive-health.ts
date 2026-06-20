import crypto from "crypto";
import {
  getGoogleDriveAuthMode,
  googleDriveOauthClientId,
  googleDriveTarget,
  validateGoogleDriveScheduledConfig,
} from "./google-drive-config";
import { refreshGoogleDriveOauthAccessToken } from "./google-drive-oauth";
import {
  deleteGoogleDriveFile,
  listTextFilesFromGoogleDriveByNamePrefix,
  readTextFileFromGoogleDrive,
  writeTextFileToGoogleDrive,
} from "./google-drive-storage";
import { isServerlessRuntime, metaStoragePolicySummary } from "./meta-storage-policy";

export type GoogleDriveHealthStatus = "passed" | "failed" | "warning";

export type GoogleDriveHealthCheckItem = {
  id: string;
  label: string;
  status: GoogleDriveHealthStatus;
  message: string;
};

export type GoogleDriveHealthReport = {
  ok: boolean;
  checkedAt: string;
  authMode: "oauth" | "service-account" | null;
  clientIdMasked: string | null;
  targetConfigured: boolean;
  runtime: "serverless" | "local-node";
  checks: GoogleDriveHealthCheckItem[];
  requiredActions: string[];
};

type MutableCheck = Omit<GoogleDriveHealthCheckItem, "status" | "message"> & {
  run: () => Promise<string>;
};

export async function runGoogleDriveHealthCheck(): Promise<GoogleDriveHealthReport> {
  const checkedAt = new Date().toISOString();
  const config = validateGoogleDriveScheduledConfig();
  const policy = metaStoragePolicySummary();
  const checks: GoogleDriveHealthCheckItem[] = [];
  const requiredActions: string[] = [];

  if (config.ok) {
    checks.push({
      id: "config",
      label: "Google Drive credential set",
      status: "passed",
      message: `Google Drive auth mode is ${config.mode}.`,
    });
  } else {
    const message = [...config.failures, config.missing.length ? `Missing: ${config.missing.join(", ")}` : ""]
      .filter(Boolean)
      .join(" ");
    checks.push({
      id: "config",
      label: "Google Drive credential set",
      status: "failed",
      message: message || "Google Drive credentials are incomplete.",
    });
    requiredActions.push(
      "Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN from the same Google Web OAuth client, then redeploy Vercel Production.",
    );
  }

  if (config.warnings.length) {
    checks.push({
      id: "config-warnings",
      label: "Google Drive configuration warnings",
      status: "warning",
      message: config.warnings.join(" "),
    });
  }

  const backendCheck = googleDriveBackendPolicyCheck(policy);
  checks.push(backendCheck);
  if (backendCheck.status === "failed") {
    requiredActions.push(
      "For Vercel online storage, set META_PROJECT_STORAGE_BACKEND, META_USER_PROJECTS_STORAGE_BACKEND, META_AI_SETTINGS_STORAGE_BACKEND, META_FULL_TEXT_HISTORY_STORAGE_BACKEND, and META_FULL_TEXT_SOURCE_STORAGE_BACKEND to google-drive, then redeploy.",
    );
  }

  const liveChecks: MutableCheck[] = [
    {
      id: "token",
      label: "OAuth access-token refresh",
      run: async () => {
        if (getGoogleDriveAuthMode() === "oauth") {
          await refreshGoogleDriveOauthAccessToken();
          return "Refresh token produced a valid Google access token.";
        }
        if (getGoogleDriveAuthMode() === "service-account") {
          return "Service-account mode skips OAuth refresh; write/read probe will verify access.";
        }
        throw new Error("Google Drive auth mode is not configured.");
      },
    },
    {
      id: "drive-write-read-delete",
      label: "Drive write/read/delete probe",
      run: async () => runDriveProbe(checkedAt),
    },
  ];

  for (const check of liveChecks) {
    try {
      checks.push({
        id: check.id,
        label: check.label,
        status: "passed",
        message: await check.run(),
      });
    } catch (error) {
      checks.push({
        id: check.id,
        label: check.label,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      requiredActions.push(
        "Regenerate Google Drive OAuth with the Web OAuth client used by Vercel Production, update GOOGLE_DRIVE_REFRESH_TOKEN in Vercel Production, and redeploy.",
      );
    }
  }

  const targetConfigured = Boolean(googleDriveTarget().trim());
  if (!targetConfigured) {
    checks.push({
      id: "target",
      label: "Google Drive target folder",
      status: "warning",
      message:
        "No explicit GOOGLE_DRIVE_FOLDER_ID or GOOGLE_DRIVE_FOLDER_URL is configured. Meta will use/create the default folder by name; an explicit folder id is safer for production.",
    });
  }

  const ok = checks.every((check) => check.status !== "failed");
  return {
    ok,
    checkedAt,
    authMode: getGoogleDriveAuthMode(),
    clientIdMasked: maskClientId(googleDriveOauthClientId()),
    targetConfigured,
    runtime: isServerlessRuntime() ? "serverless" : "local-node",
    checks,
    requiredActions: Array.from(new Set(requiredActions)),
  };
}

async function runDriveProbe(checkedAt: string) {
  const probeName = `meta-google-drive-health-${Date.now()}-${crypto.randomUUID()}.json`;
  const contents = JSON.stringify({
    kind: "wiregene-meta-google-drive-health",
    checkedAt,
  });

  await writeTextFileToGoogleDrive(probeName, contents);
  const readBack = await readTextFileFromGoogleDrive(probeName);
  if (readBack !== contents) {
    throw new Error("Google Drive probe file was written, but read-back contents did not match.");
  }

  const files = await listTextFilesFromGoogleDriveByNamePrefix(probeName);
  const probeFile = files.find((file) => file.name === probeName) ?? files[0];
  if (!probeFile?.id) {
    throw new Error("Google Drive probe file was readable, but its file id could not be found for cleanup.");
  }

  await deleteGoogleDriveFile(probeFile.id);
  return "Probe file was written, read back, listed, and deleted successfully.";
}

function googleDriveBackendPolicyCheck(policy: ReturnType<typeof metaStoragePolicySummary>): GoogleDriveHealthCheckItem {
  const expectedBackends = [
    ["project", policy.backends.project],
    ["userProjects", policy.backends.userProjects],
    ["aiSettings", policy.backends.aiSettings],
    ["fullTextHistory", policy.backends.fullTextHistory],
    ["fullTextSource", policy.backends.fullTextSource],
  ] as const;
  const nonGoogleDrive = expectedBackends.filter(([, backend]) => backend !== "google-drive");
  if (policy.runtime === "serverless" && nonGoogleDrive.length) {
    return {
      id: "meta-storage-backends",
      label: "Meta storage backend policy",
      status: "failed",
      message: `Vercel/serverless online storage must use Google Drive for all Meta shared stores. Non-Google backends: ${nonGoogleDrive
        .map(([name, backend]) => `${name}=${backend}`)
        .join(", ")}.`,
    };
  }
  if (nonGoogleDrive.length) {
    return {
      id: "meta-storage-backends",
      label: "Meta storage backend policy",
      status: "warning",
      message: `This local/Synology runtime is not fully using Google Drive: ${nonGoogleDrive
        .map(([name, backend]) => `${name}=${backend}`)
        .join(", ")}.`,
    };
  }
  return {
    id: "meta-storage-backends",
    label: "Meta storage backend policy",
    status: "passed",
    message: "All Meta shared storage backends resolve to google-drive.",
  };
}

function maskClientId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 14) return `${trimmed.slice(0, 3)}...`;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-10)}`;
}
