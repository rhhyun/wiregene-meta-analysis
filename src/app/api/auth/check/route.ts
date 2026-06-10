import { NextResponse } from "next/server";

import { getWiregeneAppMode } from "@/lib/app-mode";
import { portalSiteIds, verifyPortalAccountCredentials } from "@/lib/portal-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (getWiregeneAppMode(request.headers.get("host")) !== "portal") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  if (!isAuthorizedAuthCheckRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
    site?: string;
  } | null;

  const username = payload?.username?.trim() ?? "";
  const password = payload?.password ?? "";
  const site = payload?.site ?? "";

  if (!username || !password || !portalSiteIds().includes(site as never)) {
    return NextResponse.json({ ok: false });
  }

  const account = await verifyPortalAccountCredentials({ username, password, site });
  if (!account) {
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json(
    {
      ok: true,
      username: account.username,
      role: account.role,
      sites: account.sites,
      mustChangePassword: account.mustChangePassword,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function isAuthorizedAuthCheckRequest(request: Request) {
  const secret = process.env.PORTAL_AUTH_CHECK_SECRET ?? process.env.WIREGENE_AUTH_CHECK_SECRET;
  if (!secret) return false;
  return request.headers.get("x-wiregene-auth-check-secret") === secret;
}
