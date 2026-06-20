import { NextRequest, NextResponse } from "next/server";

import { getWiregeneAppMode } from "@/lib/app-mode";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import {
  buildGoogleDriveOAuthAuthorizationUrl,
  checkGoogleDriveOAuthClientForRedirect,
  createGoogleDriveOAuthNonce,
  createGoogleDriveOAuthState,
  describeGoogleDriveOAuthRedirectUri,
  type GoogleDriveOAuthAuthorizationPreflight,
  type GoogleDriveOAuthClientCredentials,
  type GoogleDriveOAuthClientStatus,
  type GoogleDriveOAuthRedirectUriDescription,
  googleDriveOAuthCookieMaxAgeSeconds,
  googleDriveOAuthCookieName,
  googleDriveOAuthProductionRedirectUri,
  googleDriveOAuthTemporaryClientCookieName,
  maskGoogleDriveClientId,
  maskGoogleDriveClientIdValue,
  preflightGoogleDriveOAuthAuthorizationUrl,
  sealGoogleDriveOAuthTemporaryClient,
} from "@/lib/google-drive-web-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const googleDriveOAuthConfirmCookieName = "wiregene_gdrive_oauth_confirm";

export async function GET(request: NextRequest) {
  const auth = await requireMetaUser(request);
  if (auth) return auth;
  const canonical = canonicalMetaOAuthRedirect(request);
  if (canonical) return canonical;

  try {
    const redirect = describeGoogleDriveOAuthRedirectUri(request.nextUrl);
    const clientStatus = checkGoogleDriveOAuthClientForRedirect(redirect);
    const confirmNonce = createGoogleDriveOAuthNonce();
    const page =
      request.nextUrl.searchParams.get("diagnose") === "1"
        ? diagnosticPage(redirect, clientStatus, confirmNonce)
        : startPage(redirect, clientStatus, confirmNonce);

    return confirmationHtmlResponse(request, page, confirmNonce);
  } catch (error) {
    return htmlResponse(errorPage("Google Drive connection could not start", errorMessage(error)), 400);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireMetaUser(request);
  if (auth) return auth;
  const canonical = canonicalMetaOAuthRedirect(request);
  if (canonical) return canonical;

  try {
    const redirect = describeGoogleDriveOAuthRedirectUri(request.nextUrl);
    const clientStatus = checkGoogleDriveOAuthClientForRedirect(redirect);
    const formData = await request.formData();
    const confirmNonce = String(formData.get("confirmNonce") ?? "");
    const cookieNonce = request.cookies.get(googleDriveOAuthConfirmCookieName)?.value ?? "";
    const confirmed = formData.get("confirmGoogleCloud") === "on";
    const oauthClientMode = String(formData.get("oauthClientMode") ?? "configured");

    if (!confirmed) {
      const nextNonce = createGoogleDriveOAuthNonce();
      return confirmationHtmlResponse(
        request,
        startPage(redirect, clientStatus, nextNonce, "Confirm the checkbox before continuing to Google."),
        nextNonce,
        400,
      );
    }

    if (!confirmNonce || !cookieNonce || confirmNonce !== cookieNonce) {
      const nextNonce = createGoogleDriveOAuthNonce();
      return confirmationHtmlResponse(
        request,
        startPage(redirect, clientStatus, nextNonce, "OAuth confirmation expired. Review the values and try again."),
        nextNonce,
        400,
      );
    }

    const temporaryClient =
      oauthClientMode === "temporary" ? temporaryClientFromFormData(formData) : null;

    if (oauthClientMode !== "temporary" && !clientStatus.ok) {
      const nextNonce = createGoogleDriveOAuthNonce();
      return confirmationHtmlResponse(
        request,
        startPage(redirect, clientStatus, nextNonce, clientStatus.message),
        nextNonce,
        400,
      );
    }

    const oauthClient = temporaryClient ?? null;
    const oauthNonce = createGoogleDriveOAuthNonce();
    const state = createGoogleDriveOAuthState({
      nonce: oauthNonce,
      redirectUri: redirect.redirectUri,
      ...(oauthClient ? { clientId: oauthClient.clientId } : {}),
    });
    const authorizationUrl = buildGoogleDriveOAuthAuthorizationUrl({
      redirectUri: redirect.redirectUri,
      state,
      ...(oauthClient ? { clientId: oauthClient.clientId } : {}),
    });

    const preflight = await preflightGoogleDriveOAuthAuthorizationUrl(authorizationUrl);
    if (!preflight.ok) {
      return htmlResponse(preflightFailedPage({ redirect, clientStatus, preflight }), 400);
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
    if (oauthClient) {
      response.cookies.set(googleDriveOAuthTemporaryClientCookieName, sealGoogleDriveOAuthTemporaryClient(oauthClient), {
        httpOnly: true,
        maxAge: googleDriveOAuthCookieMaxAgeSeconds,
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    } else {
      response.cookies.set(googleDriveOAuthTemporaryClientCookieName, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
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

function canonicalMetaOAuthRedirect(request: NextRequest) {
  const host = request.nextUrl.hostname.toLowerCase();
  if (host === "meta.wiregene.com") return null;
  if (!isPublicMetaOAuthAlias(host)) return null;

  const url = new URL(request.nextUrl);
  url.protocol = "https:";
  url.hostname = "meta.wiregene.com";
  url.port = "";
  return NextResponse.redirect(url, 303);
}

function isPublicMetaOAuthAlias(host: string) {
  return (
    host === "mata.wiregene.com" ||
    host === "search.wiregene.com" ||
    host === "search.wiregen.com" ||
    (host.endsWith(".vercel.app") && process.env.VERCEL_ENV === "production")
  );
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

function diagnosticPage(
  redirect: GoogleDriveOAuthRedirectUriDescription,
  clientStatus: GoogleDriveOAuthClientStatus,
  confirmNonce: string,
) {
  return shellPage({
    title: "Google Drive OAuth redirect URI check",
    tone: clientStatus.ok ? "info" : "error",
    body: `
      ${runtimeValueBox(redirect, clientStatus)}
      ${oauthClientGuidance(clientStatus)}
      ${configuredClientForm(confirmNonce, clientStatus)}
      ${temporaryClientRepairForm(confirmNonce)}
      <p><a href="/">Return to Meta</a></p>
    `,
  });
}

function startPage(
  redirect: GoogleDriveOAuthRedirectUriDescription,
  clientStatus: GoogleDriveOAuthClientStatus,
  confirmNonce: string,
  error = "",
) {
  return shellPage({
    title: "Google Drive connection preflight",
    tone: clientStatus.ok ? "info" : "error",
    body: `
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      ${runtimeValueBox(redirect, clientStatus)}
      ${oauthClientGuidance(clientStatus)}
      ${configuredClientForm(confirmNonce, clientStatus)}
      ${temporaryClientRepairForm(confirmNonce)}
      <p><a href="/">Return to Meta</a></p>
    `,
  });
}

function preflightFailedPage({
  redirect,
  clientStatus,
  preflight,
}: {
  redirect: GoogleDriveOAuthRedirectUriDescription;
  clientStatus: GoogleDriveOAuthClientStatus;
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
      ${runtimeValueBox(redirect, clientStatus)}
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
    .ok{border:1px solid #a7f3d0;background:#ecfdf5;border-radius:8px;padding:16px;color:#064e3b}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .field{display:block;margin:12px 0 4px;font-weight:700}
    input[type=text],input[type=password]{box-sizing:border-box;width:100%;border:1px solid #94a3b8;border-radius:8px;padding:12px;font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
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

function runtimeValueBox(
  redirect: GoogleDriveOAuthRedirectUriDescription,
  clientStatus: GoogleDriveOAuthClientStatus,
) {
  const lockNotice =
    redirect.source === "meta-production-locked"
      ? "<p><strong>Production lock:</strong> Meta production ignores <code>GOOGLE_DRIVE_OAUTH_REDIRECT_URI</code> and always sends this fixed callback to Google.</p>"
      : "";
  return `<div class="box">
    <p>The app will use this exact redirect URI for Google Drive OAuth.</p>
    <textarea readonly>${escapeHtml(redirect.redirectUri)}</textarea>
    ${lockNotice}
    <p>Default production URI: <code>${escapeHtml(googleDriveOAuthProductionRedirectUri)}</code></p>
    <p>Redirect source: <code>${escapeHtml(redirect.source)}</code></p>
    <p>Current Client ID: <code>${escapeHtml(maskGoogleDriveClientId())}</code></p>
    <p>Expected Client ID: <code>${escapeHtml(maskGoogleDriveClientIdValue(clientStatus.expectedClientId ?? ""))}</code></p>
    <p>Client status: <code>${escapeHtml(clientStatus.code)}</code></p>
  </div>`;
}

function oauthClientGuidance(clientStatus: GoogleDriveOAuthClientStatus) {
  if (clientStatus.ok) {
    return `<div class="ok"><p>${escapeHtml(clientStatus.message)}</p></div>`;
  }

  return `<div class="error">
    <p><strong>Google login is blocked before redirect.</strong></p>
    <p>${escapeHtml(clientStatus.message)}</p>
    <p>Do not continue with the current Vercel client id. It will keep producing Google's <code>redirect_uri_mismatch</code> page.</p>
  </div>`;
}

function configuredClientForm(confirmNonce: string, clientStatus: GoogleDriveOAuthClientStatus) {
  if (!clientStatus.ok) {
    return `<div class="warn">
      <p>The running Vercel OAuth client is not verified, so Meta will not send this request to Google.</p>
      <p>Use the repair form below with the exact Web OAuth Client ID and Client Secret from Google Cloud, or set <code>GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID</code> to the correct client id and redeploy.</p>
    </div>`;
  }

  return `<form method="post" action="/api/google-drive/oauth/start">
    <input type="hidden" name="confirmNonce" value="${escapeHtml(confirmNonce)}">
    <input type="hidden" name="oauthClientMode" value="configured">
    <label>
      <input type="checkbox" name="confirmGoogleCloud" required>
      I confirmed this exact redirect URI is registered in Google Cloud Authorized redirect URIs for the displayed Client ID.
    </label>
    <p><button class="button" type="submit">Continue to Google login</button></p>
  </form>`;
}

function temporaryClientRepairForm(confirmNonce: string) {
  return `<div class="box">
    <h2>Repair with the correct Google Web OAuth client</h2>
    <p>Paste the Web OAuth Client ID and Client Secret from the Google Cloud OAuth client that has this Authorized redirect URI. Meta stores them only in a short-lived encrypted HttpOnly cookie for this OAuth callback.</p>
    <form method="post" action="/api/google-drive/oauth/start">
      <input type="hidden" name="confirmNonce" value="${escapeHtml(confirmNonce)}">
      <input type="hidden" name="oauthClientMode" value="temporary">
      <label class="field" for="temporaryClientId">Google Web OAuth Client ID</label>
      <input id="temporaryClientId" name="temporaryClientId" type="text" autocomplete="off" placeholder="...apps.googleusercontent.com" required>
      <label class="field" for="temporaryClientSecret">Google Web OAuth Client Secret</label>
      <input id="temporaryClientSecret" name="temporaryClientSecret" type="password" autocomplete="off" required>
      <label>
        <input type="checkbox" name="confirmGoogleCloud" required>
        I confirmed this exact redirect URI is registered in Google Cloud Authorized redirect URIs for this pasted Client ID.
      </label>
      <p><button class="button" type="submit">Start repair OAuth with pasted client</button></p>
    </form>
  </div>`;
}

function temporaryClientFromFormData(formData: FormData): GoogleDriveOAuthClientCredentials {
  const clientId = String(formData.get("temporaryClientId") ?? "").trim();
  const clientSecret = String(formData.get("temporaryClientSecret") ?? "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Temporary Google OAuth Client ID and Client Secret are required.");
  }
  if (!/\.apps\.googleusercontent\.com$/i.test(clientId)) {
    throw new Error("Temporary Google OAuth Client ID must end with .apps.googleusercontent.com.");
  }

  return { clientId, clientSecret };
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
