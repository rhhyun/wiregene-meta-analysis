import {
  getBasicAuthCredentialsFromEnv,
  isAdminUsername,
  normalizeAuthEnvValue,
  parseBasicAuthCredential,
  type BasicAuthCredential,
} from "./basic-auth-users";
import type { WiregeneAppMode } from "./app-mode";
import { verifyPortalAccountCredentials } from "./portal-accounts";

type AuthSessionEnv = Record<string, string | undefined>;

export type CurrentWiregeneUser = {
  username: string;
  role: "admin" | "user";
  roleLabel: "관리자" | "사용자";
  isAdmin: boolean;
};

type CurrentWiregeneUserOptions = {
  env?: AuthSessionEnv;
  mode?: WiregeneAppMode;
};

export async function getCurrentWiregeneUser(
  authorization: string | undefined | null,
  options: CurrentWiregeneUserOptions = {},
): Promise<CurrentWiregeneUser | null> {
  const env = options.env ?? process.env;
  const providedCredential = parseBasicAuthCredential(authorization ?? "");
  if (!providedCredential) return null;

  const environmentUser = getEnvironmentUser(providedCredential, env);
  if (environmentUser) return environmentUser;

  if (options.mode === "portal") {
    return getLocalPortalUser(providedCredential);
  }

  if (options.mode === "search" || options.mode === "meta") {
    return getRemotePortalUser(providedCredential, options.mode, env);
  }

  return null;
}

function getEnvironmentUser(
  providedCredential: Pick<BasicAuthCredential, "username" | "password">,
  env: AuthSessionEnv,
): CurrentWiregeneUser | null {
  const matchedCredential = getBasicAuthCredentialsFromEnv(env).find((credential) =>
    matchesCredential(credential, providedCredential),
  );
  if (!matchedCredential) return null;
  const isAdmin = isAdminUsername(matchedCredential.username, env);

  return currentUser(matchedCredential.username, isAdmin ? "admin" : "user");
}

async function getLocalPortalUser(
  providedCredential: Pick<BasicAuthCredential, "username" | "password">,
): Promise<CurrentWiregeneUser | null> {
  const account = await verifyPortalAccountCredentials({
    username: providedCredential.username,
    password: providedCredential.password,
    site: "portal",
  });
  if (!account) return null;

  return currentUser(account.username, account.role);
}

async function getRemotePortalUser(
  providedCredential: Pick<BasicAuthCredential, "username" | "password">,
  mode: Extract<WiregeneAppMode, "search" | "meta">,
  env: AuthSessionEnv,
): Promise<CurrentWiregeneUser | null> {
  const secret = getAuthCheckSecret(env);
  if (!secret) return null;

  try {
    const authCheckUrl =
      normalizeAuthEnvValue(env.PORTAL_AUTH_CHECK_URL) ||
      "https://portal.wiregene.com/api/auth/check";
    const response = await fetch(authCheckUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wiregene-auth-check-secret": secret,
      },
      body: JSON.stringify({
        username: providedCredential.username,
        password: providedCredential.password,
        site: mode,
      }),
      cache: "no-store",
    });

    if (!response.ok) return null;
    const result = (await response.json()) as {
      ok?: boolean;
      username?: string;
      role?: "admin" | "user";
    };

    if (result.ok !== true || !result.username) return null;
    return currentUser(result.username, result.role === "admin" ? "admin" : "user");
  } catch {
    return null;
  }
}

function currentUser(username: string, role: "admin" | "user"): CurrentWiregeneUser {
  return {
    username,
    role,
    roleLabel: role === "admin" ? "관리자" : "사용자",
    isAdmin: role === "admin",
  };
}

function getAuthCheckSecret(env: AuthSessionEnv) {
  return (
    normalizeAuthEnvValue(env.PORTAL_AUTH_CHECK_SECRET) ||
    normalizeAuthEnvValue(env.WIREGENE_AUTH_CHECK_SECRET)
  );
}

function matchesCredential(
  expected: BasicAuthCredential,
  provided: Pick<BasicAuthCredential, "username" | "password">,
) {
  return expected.username === provided.username && expected.password === provided.password;
}
