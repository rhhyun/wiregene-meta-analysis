import {
  googleServiceAccountJsonFromEnv,
  validateGoogleServiceAccountSecret,
} from "./google-service-account";

export type GoogleDriveAuthMode = "oauth" | "service-account";

export function googleDriveOauthClientId() {
  return (process.env.GOOGLE_DRIVE_CLIENT_ID ?? "").trim();
}

export function googleDriveOauthClientSecret() {
  return (process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "").trim();
}

export function googleDriveOauthRefreshToken() {
  return (process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "").trim();
}

export function googleDriveTarget() {
  return (
    process.env.GOOGLE_DRIVE_FOLDER_ID ||
    process.env.GOOGLE_DRIVE_FOLDER_URL ||
    process.env.GOOGLE_DRIVE_DATABASE_FILE_ID ||
    process.env.GOOGLE_DRIVE_FILE_ID ||
    ""
  );
}

export function googleDriveAuthModePreference(): GoogleDriveAuthMode | null {
  const normalized = (process.env.GOOGLE_DRIVE_AUTH_MODE ?? "").trim().toLowerCase();
  if (normalized === "oauth") return "oauth";
  if (normalized === "service-account" || normalized === "service_account" || normalized === "serviceaccount") {
    return "service-account";
  }
  return null;
}

export function hasCompleteGoogleDriveOauthConfig() {
  return Boolean(
    googleDriveOauthClientId() &&
      googleDriveOauthClientSecret() &&
      googleDriveOauthRefreshToken(),
  );
}

export function hasCompleteGoogleDriveServiceAccountConfig() {
  return Boolean(googleServiceAccountJsonFromEnv() && googleDriveTarget());
}

export function hasAnyGoogleDriveOauthConfig() {
  return Boolean(
    googleDriveOauthClientId() ||
      googleDriveOauthClientSecret() ||
      googleDriveOauthRefreshToken(),
  );
}

export function getGoogleDriveAuthMode(): GoogleDriveAuthMode | null {
  const preferredMode = googleDriveAuthModePreference();
  if (preferredMode === "oauth") return hasCompleteGoogleDriveOauthConfig() ? "oauth" : null;
  if (preferredMode === "service-account") {
    return hasCompleteGoogleDriveServiceAccountConfig() ? "service-account" : null;
  }

  if (hasCompleteGoogleDriveOauthConfig()) return "oauth";
  if (hasCompleteGoogleDriveServiceAccountConfig()) return "service-account";
  return null;
}

export function validateGoogleDriveScheduledConfig() {
  const failures: string[] = [];
  const warnings: string[] = [];
  const missing: string[] = [];
  const hasServiceAccount = Boolean(googleServiceAccountJsonFromEnv());
  const hasTarget = Boolean(googleDriveTarget());
  const hasOauth = hasCompleteGoogleDriveOauthConfig();
  const preferredMode = googleDriveAuthModePreference();

  if (!process.env.NCBI_EMAIL) missing.push("NCBI_EMAIL");

  if ((process.env.GOOGLE_DRIVE_AUTH_MODE ?? "").trim() && !preferredMode) {
    failures.push("GOOGLE_DRIVE_AUTH_MODE must be either oauth or service-account.");
  }

  if (hasAnyGoogleDriveOauthConfig() && !hasOauth) {
    if (!googleDriveOauthClientId()) missing.push("GOOGLE_DRIVE_CLIENT_ID");
    if (!googleDriveOauthClientSecret()) missing.push("GOOGLE_DRIVE_CLIENT_SECRET");
    if (!googleDriveOauthRefreshToken()) missing.push("GOOGLE_DRIVE_REFRESH_TOKEN");
  }

  if (preferredMode === "oauth" && !hasOauth) {
    failures.push(
      "GOOGLE_DRIVE_AUTH_MODE=oauth is set, but GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, or GOOGLE_DRIVE_REFRESH_TOKEN is missing.",
    );
  }

  if (preferredMode === "service-account" && !hasCompleteGoogleDriveServiceAccountConfig()) {
    failures.push(
      "GOOGLE_DRIVE_AUTH_MODE=service-account is set, but GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID/GOOGLE_DRIVE_DATABASE_FILE_ID are not both configured.",
    );
  }

  if (hasOauth && preferredMode !== "service-account") {
    if (hasServiceAccount) {
      warnings.push(
        "OAuth Drive credentials are configured, so GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON will be ignored unless GOOGLE_DRIVE_AUTH_MODE=service-account is set.",
      );
    }
  } else if (hasServiceAccount) {
    const serviceAccountFailure = validateGoogleServiceAccountSecret(googleServiceAccountJsonFromEnv());
    if (serviceAccountFailure) failures.push(serviceAccountFailure);

    if (!hasTarget) {
      failures.push(
        [
          "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is configured without GOOGLE_DRIVE_FOLDER_ID or GOOGLE_DRIVE_DATABASE_FILE_ID.",
          "Service accounts cannot upload files to their own Drive root because they do not have storage quota.",
          "Use OAuth secrets for a personal Google Drive, or provide a Shared Drive folder/file target that the service account can write to.",
        ].join(" "),
      );
    } else {
      warnings.push(
        [
          "Using service-account Drive authentication.",
          "This only works reliably with a Shared Drive or domain setup where the service account can create files.",
          "For a personal Google Drive, use OAuth refresh-token secrets instead.",
        ].join(" "),
      );
    }
  } else {
    missing.push(
      "GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN",
    );
    failures.push(
      [
        "No usable Google Drive authentication is configured.",
        "For a personal Google Drive, configure OAuth refresh-token secrets.",
        "Service-account JSON alone is not enough because service accounts do not have Drive storage quota.",
      ].join(" "),
    );
  }

  return {
    ok: missing.length === 0 && failures.length === 0,
    mode: getGoogleDriveAuthMode(),
    missing,
    failures,
    warnings,
  };
}
