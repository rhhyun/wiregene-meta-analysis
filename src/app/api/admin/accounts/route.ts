import { NextResponse } from "next/server";

import { appModeLabel, getWiregeneAppMode } from "@/lib/app-mode";
import { getBasicAuthAccountSummaries } from "@/lib/basic-auth-users";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import {
  createPortalAccount,
  deletePortalAccount,
  listPortalAccountSummaries,
  portalSites,
  type PortalSiteId,
  resetPortalAccountPassword,
} from "@/lib/portal-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAccountManagementMode(request)) return accountManagementOnlyResponse();
  if (!(await isAuthenticatedAdminRequest(request))) return authRequiredResponse(request);

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
      managedBy: mode === "portal" ? "Portal account storage + Vercel Basic Auth" : "Portal account storage",
      writable: true,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  if (!isAccountManagementMode(request)) return accountManagementOnlyResponse();
  if (!(await isAuthenticatedAdminRequest(request))) return authRequiredResponse(request);

  try {
    const payload = (await request.json()) as {
      username?: string;
      initialPassword?: string;
      email?: string;
      role?: "admin" | "user";
      sites?: string[];
    };
    if (!payload.username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }
    const result = await createPortalAccount({
      username: payload.username,
      initialPassword: payload.initialPassword,
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
  if (!isAccountManagementMode(request)) return accountManagementOnlyResponse();
  if (!(await isAuthenticatedAdminRequest(request))) return authRequiredResponse(request);

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

export async function DELETE(request: Request) {
  if (!isAccountManagementMode(request)) return accountManagementOnlyResponse();
  if (!(await isAuthenticatedAdminRequest(request))) return authRequiredResponse(request);

  try {
    const payload = (await request.json()) as {
      accountId?: string;
    };

    if (!payload.accountId) {
      return NextResponse.json({ error: "Account ID is required." }, { status: 400 });
    }

    const result = await deletePortalAccount(payload.accountId);
    return NextResponse.json(result);
  } catch (error) {
    return accountErrorResponse(error);
  }
}

function isAccountManagementMode(request: Request) {
  const mode = getWiregeneAppMode(request.headers.get("host"));
  return mode === "portal" || mode === "meta";
}

function accountManagementOnlyResponse() {
  return NextResponse.json(
    {
      error: "Writable account management is available only on Wiregene Portal or Wiregene Meta.",
    },
    { status: 403 },
  );
}

function authRequiredResponse(request: Request) {
  const mode = getWiregeneAppMode(request.headers.get("host"));
  return NextResponse.json(
    {
      error: "Administrator login is required.",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${appModeLabel(mode)}", charset="UTF-8"`,
      },
    },
  );
}

async function isAuthenticatedAdminRequest(request: Request) {
  const mode = getWiregeneAppMode(request.headers.get("host"));
  const currentUser = await getCurrentWiregeneUser(request.headers.get("authorization"), { mode });
  return currentUser?.isAdmin === true;
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
