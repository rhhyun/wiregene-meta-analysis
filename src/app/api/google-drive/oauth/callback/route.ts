import { NextRequest, NextResponse } from "next/server";

import { getWiregeneAppMode } from "@/lib/app-mode";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import {
  exchangeGoogleDriveOAuthCode,
  googleDriveOAuthCallbackPath,
  googleDriveOAuthCookieName,
  maskGoogleDriveClientId,
  resolveGoogleDriveOAuthRedirectUri,
  verifyGoogleDriveOAuthState,
} from "@/lib/google-drive-web-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMetaUser(request);
  if (auth) return auth;

  const redirectUri = resolveGoogleDriveOAuthRedirectUri(request.nextUrl);
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const nonce = request.cookies.get(googleDriveOAuthCookieName)?.value ?? "";

  const clearCookie = (response: NextResponse) => {
    response.cookies.set(googleDriveOAuthCookieName, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  };

  try {
    if (error) throw new Error(`Google authorization failed: ${error}`);
    if (!code) throw new Error("Google did not return an authorization code.");
    if (!state) throw new Error("Google did not return OAuth state.");
    if (!nonce) throw new Error("OAuth browser session expired. Start the connection again.");

    verifyGoogleDriveOAuthState({ state, nonce, redirectUri });
    const token = await exchangeGoogleDriveOAuthCode({ code, redirectUri });
    return clearCookie(htmlResponse(successPage({ refreshToken: token.refreshToken, redirectUri })));
  } catch (caught) {
    return clearCookie(htmlResponse(errorPage(errorMessage(caught), redirectUri), 400));
  }
}

async function requireMetaUser(request: NextRequest) {
  const mode = getWiregeneAppMode(request.headers.get("host"));
  if (mode !== "meta") {
    return htmlResponse(errorPage("Google Drive connection is available only on meta.wiregene.com", ""), 403);
  }

  const user = await getCurrentWiregeneUser(request.headers.get("authorization"), { mode });
  if (!user) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Wiregene Meta", charset="UTF-8"',
      },
    });
  }
  if (googleDriveOAuthAdminOnly() && !user.isAdmin) {
    return htmlResponse(errorPage("Administrator permission is required", "Portal admin role is required."), 403);
  }

  return null;
}

function googleDriveOAuthAdminOnly() {
  return /^(1|true|yes|on)$/i.test((process.env.META_GOOGLE_DRIVE_OAUTH_ADMIN_ONLY ?? "").trim());
}

function successPage({
  refreshToken,
  redirectUri,
}: {
  refreshToken: string;
  redirectUri: string;
}) {
  const envBlock = [
    `GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`,
    "META_ALLOW_GOOGLE_DRIVE_STORAGE=true",
    "META_PROJECT_STORAGE_BACKEND=google-drive",
    "META_USER_PROJECTS_STORAGE_BACKEND=google-drive",
    "META_AI_SETTINGS_STORAGE_BACKEND=google-drive",
    "META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive",
    "META_FULL_TEXT_SOURCE_STORAGE_BACKEND=google-drive",
  ].join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Google Drive connected</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:960px;margin:44px auto;padding:0 20px;line-height:1.6;color:#0f172a}
    .ok{border:1px solid #a7f3d0;background:#ecfdf5;border-radius:8px;padding:16px}
    textarea{box-sizing:border-box;width:100%;min-height:230px;border:1px solid #94a3b8;border-radius:8px;padding:14px;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    code{background:#f1f5f9;border-radius:4px;padding:2px 5px}
    a{color:#047857;font-weight:700}
  </style>
</head>
<body>
  <p style="font-weight:700;color:#047857">Wiregene Meta Google Drive OAuth</p>
  <h1>Google Drive connection verified</h1>
  <div class="ok">
    <p>The refresh token was issued and verified with the current Web OAuth client and Google Drive permission.</p>
    <p>Client ID: <code>${escapeHtml(maskGoogleDriveClientId())}</code></p>
    <p>Callback URI: <code>${escapeHtml(redirectUri)}</code></p>
  </div>
  <h2>Values to add to Vercel Production Environment Variables</h2>
  <textarea readonly>${escapeHtml(envBlock)}</textarea>
  <p>After saving these values in Vercel, redeploy Production. <code>GOOGLE_DRIVE_CLIENT_ID</code>, <code>GOOGLE_DRIVE_CLIENT_SECRET</code>, and this refresh token must belong to the same Web OAuth client.</p>
  <p><a href="/api/meta-analysis/storage-policy">Check storage policy</a> · <a href="/">Return to Meta</a></p>
</body>
</html>`;
}

function errorPage(detail: string, redirectUri: string) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Google Drive connection failed</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:880px;margin:44px auto;padding:0 20px;line-height:1.6;color:#0f172a}
    .error{border:1px solid #fecdd3;background:#fff1f2;border-radius:8px;padding:16px;color:#881337}
    code{background:#f1f5f9;border-radius:4px;padding:2px 5px}
    a{color:#047857;font-weight:700}
  </style>
</head>
<body>
  <p style="font-weight:700;color:#be123c">Wiregene Meta Google Drive OAuth</p>
  <h1>Google Drive connection failed</h1>
  <div class="error">${escapeHtml(detail)}</div>
  <p>The Google Cloud authorized redirect URI must exactly match this value.</p>
  <p><code>${escapeHtml(redirectUri || `https://meta.wiregene.com${googleDriveOAuthCallbackPath}`)}</code></p>
  <p><a href="/api/google-drive/oauth/start">Start again</a> · <a href="/">Return to Meta</a></p>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
