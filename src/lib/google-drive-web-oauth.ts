import crypto from "crypto";

import {
  googleDriveOauthClientId,
  googleDriveOauthClientSecret,
} from "./google-drive-config";
import { refreshGoogleDriveOauthAccessToken } from "./google-drive-oauth";

export const googleDriveOAuthCallbackPath = "/api/google-drive/oauth/callback";
export const googleDriveOAuthCookieName = "wiregene_gdrive_oauth_nonce";
export const googleDriveOAuthCookieMaxAgeSeconds = 15 * 60;
export const googleDriveOAuthProductionRedirectUri = `https://meta.wiregene.com${googleDriveOAuthCallbackPath}`;

const googleAuthorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const driveFileScope = "https://www.googleapis.com/auth/drive.file";

type GoogleDriveOAuthStatePayload = {
  purpose: "google-drive-oauth";
  nonce: string;
  redirectUri: string;
  issuedAt: number;
};

export type GoogleDriveOAuthTokenResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string | null;
};

export type GoogleDriveOAuthRedirectUriDescription = {
  redirectUri: string;
  source:
    | "meta-production-locked"
    | "GOOGLE_DRIVE_OAUTH_REDIRECT_URI"
    | "request-origin";
};

export type GoogleDriveOAuthAuthorizationPreflight =
  | { ok: true }
  | {
      ok: false;
      code: string;
      message: string;
      status: number;
      evidence: string;
    };

export function resolveGoogleDriveOAuthRedirectUri(requestUrl: string | URL) {
  return describeGoogleDriveOAuthRedirectUri(requestUrl).redirectUri;
}

export function describeGoogleDriveOAuthRedirectUri(requestUrl: string | URL): GoogleDriveOAuthRedirectUriDescription {
  const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const host = url.hostname.toLowerCase();
  const explicitMode = (process.env.WIREGENE_APP_MODE ?? process.env.NEXT_PUBLIC_WIREGENE_APP_MODE ?? "")
    .trim()
    .toLowerCase();

  if (host === "meta.wiregene.com" || host === "mata.wiregene.com") {
    return { redirectUri: googleDriveOAuthProductionRedirectUri, source: "meta-production-locked" };
  }

  if (
    (process.env.VERCEL_ENV === "production" && explicitMode === "meta")
  ) {
    return { redirectUri: googleDriveOAuthProductionRedirectUri, source: "meta-production-locked" };
  }

  const configured = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return { redirectUri: configured, source: "GOOGLE_DRIVE_OAUTH_REDIRECT_URI" };

  return { redirectUri: `${url.origin}${googleDriveOAuthCallbackPath}`, source: "request-origin" };
}

export function createGoogleDriveOAuthNonce() {
  return crypto.randomBytes(24).toString("base64url");
}

export function createGoogleDriveOAuthState({
  nonce,
  redirectUri,
}: {
  nonce: string;
  redirectUri: string;
}) {
  const payload: GoogleDriveOAuthStatePayload = {
    purpose: "google-drive-oauth",
    nonce,
    redirectUri,
    issuedAt: Date.now(),
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signStatePayload(encodedPayload)}`;
}

export function verifyGoogleDriveOAuthState({
  state,
  nonce,
  redirectUri,
}: {
  state: string;
  nonce: string;
  redirectUri: string;
}) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Google Drive OAuth state is malformed.");
  }

  const expectedSignature = signStatePayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    throw new Error("Google Drive OAuth state signature is invalid.");
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as GoogleDriveOAuthStatePayload;
  if (payload.purpose !== "google-drive-oauth") {
    throw new Error("Google Drive OAuth state purpose is invalid.");
  }
  if (payload.nonce !== nonce) {
    throw new Error("Google Drive OAuth state nonce does not match this browser session.");
  }
  if (payload.redirectUri !== redirectUri) {
    throw new Error("Google Drive OAuth redirect URI changed during authorization.");
  }
  if (!Number.isFinite(payload.issuedAt) || Date.now() - payload.issuedAt > googleDriveOAuthCookieMaxAgeSeconds * 1000) {
    throw new Error("Google Drive OAuth state expired. Start the connection again.");
  }

  return payload;
}

export function buildGoogleDriveOAuthAuthorizationUrl({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}) {
  const clientId = googleDriveOauthClientId();
  if (!clientId) throw new Error("GOOGLE_DRIVE_CLIENT_ID is missing.");

  const url = new URL(googleAuthorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", driveFileScope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url;
}

export async function preflightGoogleDriveOAuthAuthorizationUrl(
  authorizationUrl: URL,
): Promise<GoogleDriveOAuthAuthorizationPreflight> {
  try {
    const response = await fetch(authorizationUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Wiregene-Meta-OAuth-Preflight/1.0",
      },
    });

    const location = response.headers.get("location") ?? "";
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("text/html") || contentType.includes("text/plain")
      ? await response.text().catch(() => "")
      : "";
    const evidence = normalizeOAuthEvidence(`${response.status} ${location} ${body}`);

    if (/redirect_uri_mismatch/i.test(evidence)) {
      return {
        ok: false,
        code: "redirect_uri_mismatch",
        status: response.status,
        message:
          "Google rejected the OAuth authorization request before login because the redirect URI is not registered on this OAuth client.",
        evidence: truncateEvidence(evidence),
      };
    }

    if (/invalid_client/i.test(evidence)) {
      return {
        ok: false,
        code: "invalid_client",
        status: response.status,
        message:
          "Google rejected the OAuth authorization request because the configured client id is invalid or does not belong to an active Web OAuth client.",
        evidence: truncateEvidence(evidence),
      };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function exchangeGoogleDriveOAuthCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<GoogleDriveOAuthTokenResult> {
  const clientId = googleDriveOauthClientId();
  const clientSecret = googleDriveOauthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET are required.");
  }

  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(formatGoogleDriveOAuthTokenError(response.status, payload));
  }
  if (!payload.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Start again and approve the consent screen with prompt=consent.",
    );
  }

  const verifiedAccessToken = await refreshGoogleDriveOauthAccessToken(payload.refresh_token);
  return {
    accessToken: payload.access_token ?? verifiedAccessToken,
    refreshToken: payload.refresh_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    scope: payload.scope ?? null,
    tokenType: payload.token_type ?? null,
  };
}

export function maskGoogleDriveClientId() {
  const clientId = googleDriveOauthClientId();
  if (!clientId) return "not configured";
  if (clientId.length <= 12) return `${clientId.slice(0, 3)}...`;
  return `${clientId.slice(0, 8)}...${clientId.slice(-8)}`;
}

function formatGoogleDriveOAuthTokenError(
  status: number,
  payload: { error?: string; error_description?: string },
) {
  const code = payload.error ?? `HTTP_${status}`;
  if (code === "redirect_uri_mismatch") {
    return "Google Drive OAuth failed: redirect_uri_mismatch. The Google Cloud Authorized redirect URI must exactly match the Meta callback URL.";
  }
  if (code === "invalid_client") {
    return "Google Drive OAuth failed: invalid_client. Check GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.";
  }
  if (code === "invalid_grant") {
    return "Google Drive OAuth failed: invalid_grant. Start the connection again and use the same Web OAuth client.";
  }
  return `Google Drive OAuth failed: ${code}.`;
}

function signStatePayload(encodedPayload: string) {
  return crypto.createHmac("sha256", googleDriveOAuthStateSecret()).update(encodedPayload).digest("base64url");
}

function googleDriveOAuthStateSecret() {
  const secret =
    process.env.GOOGLE_DRIVE_OAUTH_STATE_SECRET?.trim() ||
    process.env.META_AI_SETTINGS_SECRET?.trim() ||
    process.env.APP_BASIC_AUTH_PASSWORD?.trim() ||
    googleDriveOauthClientSecret();

  if (!secret) {
    throw new Error("GOOGLE_DRIVE_OAUTH_STATE_SECRET or GOOGLE_DRIVE_CLIENT_SECRET is required.");
  }
  return secret;
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeOAuthEvidence(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateEvidence(value: string) {
  return value.length > 900 ? `${value.slice(0, 900)}...` : value;
}
