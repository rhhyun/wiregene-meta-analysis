import {
  googleDriveOauthClientId,
  googleDriveOauthClientSecret,
  googleDriveOauthRefreshToken,
} from "./google-drive-config";

const tokenUrl = "https://oauth2.googleapis.com/token";

type GoogleDriveRefreshClient = {
  clientId: string;
  clientSecret: string;
};

export async function refreshGoogleDriveOauthAccessToken(
  refreshToken = googleDriveOauthRefreshToken(),
  client?: GoogleDriveRefreshClient,
) {
  const clientId = client?.clientId.trim() || googleDriveOauthClientId();
  const clientSecret = client?.clientSecret.trim() || googleDriveOauthClientSecret();

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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

  if (error === "invalid_grant") {
    return "Google Drive OAuth is unavailable. Diagnostic code: GOOGLE_OAUTH_INVALID_GRANT.";
  }

  if (error === "invalid_client") {
    return "Google Drive OAuth is unavailable. Diagnostic code: GOOGLE_OAUTH_INVALID_CLIENT.";
  }

  return `Google Drive OAuth is unavailable. Diagnostic code: GOOGLE_OAUTH_${String(error).toUpperCase().replace(/[^A-Z0-9]+/g, "_") || status}.`;
}
