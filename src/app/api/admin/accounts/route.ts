import { NextResponse } from "next/server";

import { getWiregeneAppMode } from "@/lib/app-mode";
import {
  getBasicAuthAccountSummaries,
  getBasicAuthCredentialsFromEnv,
  parseBasicAuthCredential,
} from "@/lib/basic-auth-users";
import {
  createPortalAccount,
  listPortalAccountSummaries,
  portalSites,
  type PortalSiteId,
  resetPortalAccountPassword,
} from "@/lib/portal-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isPortalMode(request)) return portalOnlyResponse();
  if (!isAuthenticatedAdminRequest(request)) return authRequiredResponse();

  const mode = getWiregeneAppMode(request.headers.get("host"));
  const environmentAccounts = getBasicAuthAccountSummaries();
  const portalAccounts = await listPortalAccountSummaries();
  const accounts = [...environmentAccounts, ...portalAccounts];

  return NextResponse.json(
    {
      accounts,
      count: accounts.length,
      sites: portalSites,
      siteAccountLists: buildSiteAccountLists(accounts),
      managedBy: mode === "portal" ? "Portal account storage + Vercel Basic Auth" : "Vercel Environment Variables",
      writable: mode === "portal",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  if (!isPortalMode(request)) return portalOnlyResponse();
  if (!isAuthenticatedAdminRequest(request)) return authRequiredResponse();

  try {
    const payload = (await request.json()) as {
      username?: string;
      email?: string;
      role?: "admin" | "user";
      sites?: string[];
    };
    if (!payload.username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }
    const result = await createPortalAccount({
      username: payload.username,
      email: payload.email,
      role: payload.role,
      sites: payload.sites,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!isPortalMode(request)) return portalOnlyResponse();
  if (!isAuthenticatedAdminRequest(request)) return authRequiredResponse();

  try {
    const payload = (await request.json()) as {
      accountId?: string;
      action?: "reset-password";
    };

    if (payload.action !== "reset-password" || !payload.accountId) {
      return NextResponse.json({ error: "Unsupported account action." }, { status: 400 });
    }

    const result = await resetPortalAccountPassword(payload.accountId);
    return NextResponse.json(result);
  } catch (error) {
    return accountErrorResponse(error);
  }
}

function isPortalMode(request: Request) {
  return getWiregeneAppMode(request.headers.get("host")) === "portal";
}

function portalOnlyResponse() {
  return NextResponse.json(
    {
      error: "Writable account management is available only on portal.wiregene.com.",
    },
    { status: 403 },
  );
}

function authRequiredResponse() {
  return NextResponse.json(
    {
      error: "Portal login is required.",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Wiregene Portal", charset="UTF-8"',
      },
    },
  );
}

function isAuthenticatedAdminRequest(request: Request) {
  const credentials = getBasicAuthCredentialsFromEnv();
  if (credentials.length === 0) return false;

  const providedCredential = parseBasicAuthCredential(request.headers.get("authorization") ?? "");
  if (!providedCredential) return false;

  return credentials.some(
    (credential) =>
      credential.username === providedCredential.username &&
      credential.password === providedCredential.password,
  );
}

type AdminAccountSummary = Awaited<ReturnType<typeof listPortalAccountSummaries>>[number] | ReturnType<typeof getBasicAuthAccountSummaries>[number];

function buildSiteAccountLists(accounts: AdminAccountSummary[]) {
  return portalSites.map((site) => {
    const siteAccounts = accounts
      .filter((account) => account.sites?.includes(site.id))
      .map((account) => ({
        id: "id" in account ? account.id : undefined,
        username: account.username,
        email: "email" in account ? account.email : undefined,
        role: account.role,
        source: account.source,
        passwordConfigured: account.passwordConfigured,
        mustChangePassword: "mustChangePassword" in account ? account.mustChangePassword : undefined,
        disabled: "disabled" in account ? account.disabled : undefined,
      }))
      .sort((left, right) => left.username.localeCompare(right.username));

    return {
      id: site.id as PortalSiteId,
      label: site.label,
      shortLabel: site.shortLabel,
      url: site.url,
      count: siteAccounts.length,
      accounts: siteAccounts,
    };
  });
}

function accountErrorResponse(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Account operation failed.",
    },
    { status: 400 },
  );
}
