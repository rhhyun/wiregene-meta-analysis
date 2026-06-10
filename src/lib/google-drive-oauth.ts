import {
  googleDriveOauthClientId,
  googleDriveOauthClientSecret,
  googleDriveOauthRefreshToken,
} from "./google-drive-config";

const tokenUrl = "https://oauth2.googleapis.com/token";

export async function refreshGoogleDriveOauthAccessToken(refreshToken = googleDriveOauthRefreshToken()) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleDriveOauthClientId(),
      client_secret: googleDriveOauthClientSecret(),
      refresh_token: refreshToken.trim(),
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(formatGoogleOauthRefreshError(response.status, payload));
  }

  return payload.access_token;
}

function formatGoogleOauthRefreshError(
  status: number,
  payload: { error?: string; error_description?: string },
) {
  const error = payload.error ?? `HTTP ${status}`;
  const description = payload.error_description ?? "";

  if (error === "invalid_grant") {
    return [
      "Google OAuth refresh failed: invalid_grant.",
      "The refresh token is invalid, revoked, expired, copied incorrectly, or was generated with a different GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET pair.",
      "Regenerate GOOGLE_DRIVE_REFRESH_TOKEN locally with npm run google-drive:oauth using the same client id and secret that are stored in GitHub Actions.",
    ].join(" ");
  }

  if (error === "invalid_client") {
    return [
      "Google OAuth refresh failed: invalid_client.",
      "GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET is incorrect.",
      description,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return `Google OAuth refresh failed: ${status} ${error}${description ? `: ${description}` : ""}`;
}
