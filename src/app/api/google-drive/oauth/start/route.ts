import { NextRequest, NextResponse } from "next/server";

import { getWiregeneAppMode } from "@/lib/app-mode";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import {
  buildGoogleDriveOAuthAuthorizationUrl,
  createGoogleDriveOAuthNonce,
  createGoogleDriveOAuthState,
  describeGoogleDriveOAuthRedirectUri,
  type GoogleDriveOAuthAuthorizationPreflight,
  type GoogleDriveOAuthRedirectUriDescription,
  googleDriveOAuthCookieMaxAgeSeconds,
  googleDriveOAuthCookieName,
  googleDriveOAuthProductionRedirectUri,
  maskGoogleDriveClientId,
  preflightGoogleDriveOAuthAuthorizationUrl,
} from "@/lib/google-drive-web-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const googleDriveOAuthConfirmCookieName = "wiregene_gdrive_oauth_confirm";

export async function GET(request: NextRequest) {
  const auth = await requireMetaUser(request);
  if (auth) return auth;

  try {
    const redirect = describeGoogleDriveOAuthRedirectUri(request.nextUrl);
    const confirmNonce = createGoogleDriveOAuthNonce();
    const page =
      request.nextUrl.searchParams.get("diagnose") === "1"
        ? diagnosticPage(redirect, confirmNonce)
        : startPage(redirect, confirmNonce);

    return confirmationHtmlResponse(request, page, confirmNonce);
  } catch (error) {
    return htmlResponse(errorPage("Google Drive connection could not start", errorMessage(error)), 400);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireMetaUser(request);
  if (auth) return auth;

  try {
    const redirect = describeGoogleDriveOAuthRedirectUri(request.nextUrl);
    const formData = await request.formData();
    const confirmNonce = String(formData.get("confirmNonce") ?? "");
    const cookieNonce = request.cookies.get(googleDriveOAuthConfirmCookieName)?.value ?? "";
    const confirmed = formData.get("confirmGoogleCloud") === "on";

    if (!confirmed) {
      const nextNonce = createGoogleDriveOAuthNonce();
      return confirmationHtmlResponse(
        request,
        startPage(redirect, nextNonce, "Confirm the checkbox before continuing to Google."),
        nextNonce,
        400,
      );
    }

    if (!confirmNonce || !cookieNonce || confirmNonce !== cookieNonce) {
      const nextNonce = createGoogleDriveOAuthNonce();
      return confirmationHtmlResponse(
        request,
        startPage(redirect, nextNonce, "OAuth confirmation expired. Review the values and try again."),
        nextNonce,
        400,
      );
    }

    const oauthNonce = createGoogleDriveOAuthNonce();
    const state = createGoogleDriveOAuthState({
      nonce: oauthNonce,
      redirectUri: redirect.redirectUri,
    });
    const authorizationUrl = buildGoogleDriveOAuthAuthorizationUrl({
      redirectUri: redirect.redirectUri,
      state,
    });

    const preflight = await preflightGoogleDriveOAuthAuthorizationUrl(authorizationUrl);
    if (!preflight.ok) {
      return htmlResponse(preflightFailedPage({ redirect, preflight }), 400);
    }

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(googleDriveOAuthConfirmCookieName, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    response.cookies.set(googleDriveOAuthCookieName, oauthNonce, {
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

function confirmationHtmlResponse(request: NextRequest, html: string, confirmNonce: string, status = 200) {
  const response = htmlResponse(html, status);
  response.cookies.set(googleDriveOAuthConfirmCookieName, confirmNonce, {
    httpOnly: true,
    maxAge: googleDriveOAuthCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
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

function diagnosticPage(redirect: GoogleDriveOAuthRedirectUriDescription, confirmNonce: string) {
  return shellPage({
    title: "Google Drive OAuth redirect URI check",
    tone: "info",
    body: `
      ${runtimeValueBox(redirect)}
      <p>If Google still shows <code>redirect_uri_mismatch</code>, Vercel <code>GOOGLE_DRIVE_CLIENT_ID</code> is not the same OAuth client where this URI was registered, or the URI is in JavaScript origins instead of Authorized redirect URIs.</p>
      ${confirmationForm(confirmNonce)}
      <p><a href="/">Return to Meta</a></p>
    `,
  });
}

function startPage(redirect: GoogleDriveOAuthRedirectUriDescription, confirmNonce: string, error = "") {
  return shellPage({
    title: "Google Drive connection preflight",
    tone: "info",
    body: `
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      ${runtimeValueBox(redirect)}
      <div class="warn">
        <p>Before continuing, this URI must exist under Google Cloud OAuth client <strong>Authorized redirect URIs</strong>. JavaScript origins are not enough.</p>
        <p>If the URI is already registered but Google still rejects login, Vercel Production is using a different <code>GOOGLE_DRIVE_CLIENT_ID</code> from the Google Cloud client you edited.</p>
      </div>
      ${confirmationForm(confirmNonce)}
      <p><a href="/">Return to Meta</a></p>
    `,
  });
}

function preflightFailedPage({
  redirect,
  preflight,
}: {
  redirect: GoogleDriveOAuthRedirectUriDescription;
  preflight: Exclude<GoogleDriveOAuthAuthorizationPreflight, { ok: true }>;
}) {
  return shellPage({
    title: "Google rejected this OAuth request before login",
    tone: "error",
    body: `
      <div class="error">
        <p><strong>${escapeHtml(preflight.code)}</strong></p>
        <p>${escapeHtml(preflight.message)}</p>
      </div>
      ${runtimeValueBox(redirect)}
      <p>If this URI is already registered, Vercel Production is using a different <code>GOOGLE_DRIVE_CLIENT_ID</code> from the Google Cloud OAuth client you edited.</p>
      <p><a href="/api/google-drive/oauth/start?diagnose=1">Check again</a> · <a href="/">Return to Meta</a></p>
      <details>
        <summary>Google response evidence</summary>
        <p><code>${escapeHtml(preflight.evidence)}</code></p>
      </details>
    `,
  });
}

function shellPage({
  title,
  tone,
  body,
}: {
  title: string;
  tone: "info" | "error";
  body: string;
}) {
  const color = tone === "error" ? "#be123c" : "#0369a1";
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:960px;margin:44px auto;padding:0 20px;line-height:1.6;color:#0f172a}
    .box{border:1px solid #bae6fd;background:#f0f9ff;border-radius:8px;padding:16px}
    .warn{border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:16px;color:#78350f}
    .error{border:1px solid #fecdd3;background:#fff1f2;border-radius:8px;padding:16px;color:#881337}
    code{background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:2px 5px}
    textarea{box-sizing:border-box;width:100%;min-height:70px;border:1px solid #94a3b8;border-radius:8px;padding:14px;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    .button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:8px;background:#0369a1;color:#fff;text-decoration:none;font-weight:700;padding:0 16px;cursor:pointer}
    label{display:block;margin-top:16px;font-weight:700}
    a{color:#0369a1;font-weight:700}
  </style>
</head>
<body>
  <p style="font-weight:700;color:${color}">Wiregene Meta Google Drive OAuth</p>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

function runtimeValueBox(redirect: GoogleDriveOAuthRedirectUriDescription) {
  return `<div class="box">
    <p>The app will use this exact redirect URI for Google Drive OAuth.</p>
    <textarea readonly>${escapeHtml(redirect.redirectUri)}</textarea>
    <p>Default production URI: <code>${escapeHtml(googleDriveOAuthProductionRedirectUri)}</code></p>
    <p>Redirect source: <code>${escapeHtml(redirect.source)}</code></p>
    <p>Current Client ID: <code>${escapeHtml(maskGoogleDriveClientId())}</code></p>
  </div>`;
}

function confirmationForm(confirmNonce: string) {
  return `<form method="post" action="/api/google-drive/oauth/start">
    <input type="hidden" name="confirmNonce" value="${escapeHtml(confirmNonce)}">
    <label>
      <input type="checkbox" name="confirmGoogleCloud" required>
      I confirmed this exact redirect URI is registered in Google Cloud Authorized redirect URIs for the displayed Client ID.
    </label>
    <p><button class="button" type="submit">Continue to Google login</button></p>
  </form>`;
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
