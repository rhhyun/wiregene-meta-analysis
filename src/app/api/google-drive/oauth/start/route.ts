import { NextRequest, NextResponse } from "next/server";

import { getWiregeneAppMode } from "@/lib/app-mode";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import {
  buildGoogleDriveOAuthAuthorizationUrl,
  createGoogleDriveOAuthNonce,
  createGoogleDriveOAuthState,
  googleDriveOAuthCookieMaxAgeSeconds,
  googleDriveOAuthCookieName,
  googleDriveOAuthProductionRedirectUri,
  maskGoogleDriveClientId,
  resolveGoogleDriveOAuthRedirectUri,
} from "@/lib/google-drive-web-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMetaUser(request);
  if (auth) return auth;

  try {
    const redirectUri = resolveGoogleDriveOAuthRedirectUri(request.nextUrl);
    if (request.nextUrl.searchParams.get("diagnose") === "1") {
      return htmlResponse(diagnosticPage(redirectUri));
    }

    const nonce = createGoogleDriveOAuthNonce();
    const state = createGoogleDriveOAuthState({ nonce, redirectUri });
    const authorizationUrl = buildGoogleDriveOAuthAuthorizationUrl({ redirectUri, state });

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(googleDriveOAuthCookieName, nonce, {
      httpOnly: true,
      maxAge: googleDriveOAuthCookieMaxAgeSeconds,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return htmlResponse(errorPage("Google Drive connection could not start", errorMessage(error)), 400);
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

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function errorPage(title: string, detail: string) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 20px;line-height:1.6">
<h1>${escapeHtml(title)}</h1>
${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
<p><a href="/">Meta home</a></p>
</body>
</html>`;
}

function diagnosticPage(redirectUri: string) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Google Drive OAuth redirect URI</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:44px auto;padding:0 20px;line-height:1.6;color:#0f172a}
    .box{border:1px solid #bae6fd;background:#f0f9ff;border-radius:8px;padding:16px}
    code{background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:2px 5px}
    textarea{box-sizing:border-box;width:100%;min-height:70px;border:1px solid #94a3b8;border-radius:8px;padding:14px;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    a{color:#0369a1;font-weight:700}
  </style>
</head>
<body>
  <p style="font-weight:700;color:#0369a1">Wiregene Meta Google Drive OAuth</p>
  <h1>Google Drive OAuth redirect URI check</h1>
  <div class="box">
    <p>Register this exact URI in the Google Cloud Web OAuth client.</p>
    <textarea readonly>${escapeHtml(redirectUri)}</textarea>
    <p>Default production URI: <code>${escapeHtml(googleDriveOAuthProductionRedirectUri)}</code></p>
    <p>Current Client ID: <code>${escapeHtml(maskGoogleDriveClientId())}</code></p>
  </div>
  <p>If Google still shows <code>redirect_uri_mismatch</code>, the Vercel <code>GOOGLE_DRIVE_CLIENT_ID</code> is not the same OAuth client where this URI was registered, or the URI is in JavaScript origins instead of Authorized redirect URIs.</p>
  <p><a href="/api/google-drive/oauth/start">Start Google login</a> · <a href="/">Return to Meta</a></p>
</body>
</html>`;
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
