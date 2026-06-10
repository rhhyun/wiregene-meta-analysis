import { NextRequest, NextResponse } from "next/server";
import { appModeLabel, getWiregeneAppMode } from "@/lib/app-mode";
import { getBasicAuthCredentialsFromEnv, parseBasicAuthCredential, type BasicAuthCredential } from "@/lib/basic-auth-users";

type WiregeneAppMode = ReturnType<typeof getWiregeneAppMode>;

export async function proxy(request: NextRequest) {
  const mode = getWiregeneAppMode(request.headers.get("host"));

  if (isPortalAuthCheckPath(request.nextUrl.pathname, mode)) {
    return isAuthorizedInternalAuthCheckRequest(request)
      ? NextResponse.next()
      : new NextResponse("Not found.", { status: 404 });
  }

  if (!isPathAllowedForMode(request.nextUrl.pathname, mode)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const credentials = getBasicAuthCredentials();

  if (credentials.length === 0) {
    if (mode === "portal") return challenge(mode);
    return NextResponse.next();
  }

  const providedCredential = parseBasicAuthCredential(request.headers.get("authorization") ?? "");

  if (
    providedCredential &&
    credentials.some(
      (credential) =>
        credential.username === providedCredential.username &&
        credential.password === providedCredential.password,
    )
  ) {
    return NextResponse.next();
  }

  if (providedCredential && (await isPortalAccountCredentialAllowed(mode, providedCredential))) {
    return NextResponse.next();
  }

  return challenge(mode);
}

function getBasicAuthCredentials(): BasicAuthCredential[] {
  return getBasicAuthCredentialsFromEnv();
}

function isPathAllowedForMode(pathname: string, mode: WiregeneAppMode) {
  if (pathname === "/" || pathname === "/api/auth/logout") return true;

  if (mode === "meta") {
    return pathname.startsWith("/api/meta-analysis/");
  }

  if (mode === "portal") {
    return pathname.startsWith("/api/admin/");
  }

  if (pathname.startsWith("/api/admin/")) return false;
  if (pathname.startsWith("/api/meta-analysis/")) return false;
  return true;
}

async function isPortalAccountCredentialAllowed(
  mode: WiregeneAppMode,
  credential: { username: string; password: string },
) {
  const secret = getAuthCheckSecret();
  if (!secret) return false;

  try {
    const response = await fetch(process.env.PORTAL_AUTH_CHECK_URL ?? "https://portal.wiregene.com/api/auth/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wiregene-auth-check-secret": secret,
      },
      body: JSON.stringify({
        username: credential.username,
        password: credential.password,
        site: mode,
      }),
      cache: "no-store",
    });

    if (!response.ok) return false;
    const result = (await response.json()) as { ok?: boolean };
    return result.ok === true;
  } catch {
    return false;
  }
}

function isPortalAuthCheckPath(pathname: string, mode: WiregeneAppMode) {
  return mode === "portal" && pathname === "/api/auth/check";
}

function isAuthorizedInternalAuthCheckRequest(request: NextRequest) {
  const secret = getAuthCheckSecret();
  return Boolean(secret && request.headers.get("x-wiregene-auth-check-secret") === secret);
}

function getAuthCheckSecret() {
  return process.env.PORTAL_AUTH_CHECK_SECRET ?? process.env.WIREGENE_AUTH_CHECK_SECRET;
}

function challenge(mode: WiregeneAppMode) {
  const realm = appModeLabel(mode);
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
