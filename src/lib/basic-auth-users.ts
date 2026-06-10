export type BasicAuthCredential = {
  username: string;
  password: string;
  source: "APP_BASIC_AUTH_USER" | "APP_BASIC_AUTH_USERS";
};

type BasicAuthEnv = Record<string, string | undefined>;

export type ProvidedBasicAuthCredential = Pick<BasicAuthCredential, "username" | "password">;
export type BasicAuthAccountSummary = {
  username: string;
  source: BasicAuthCredential["source"];
  passwordConfigured: boolean;
  role: "admin" | "user";
  sites: string[];
};

export const WIREGENE_ADMIN_SITE_IDS = ["portal", "search", "meta", "hyunlab", "sci-experiment", "behavior", "human"];

export function getBasicAuthCredentialsFromEnv(env: BasicAuthEnv = process.env) {
  const credentials: BasicAuthCredential[] = [];
  const username = normalizeAuthEnvValue(env.APP_BASIC_AUTH_USER);
  const password = normalizeAuthEnvValue(env.APP_BASIC_AUTH_PASSWORD);

  if (username && password) {
    credentials.push({
      username,
      password,
      source: "APP_BASIC_AUTH_USER",
    });
  }

  credentials.push(...parseBasicAuthUsers(normalizeAuthEnvValue(env.APP_BASIC_AUTH_USERS)));
  return credentials;
}

export function getBasicAuthAccountSummaries(env: BasicAuthEnv = process.env) {
  const adminUsernames = getAdminUsernamesFromEnv(env);

  return getBasicAuthCredentialsFromEnv(env).map(
    (credential): BasicAuthAccountSummary => ({
      username: credential.username,
      source: credential.source,
      passwordConfigured: Boolean(credential.password),
      role: adminUsernames.has(normalizeAuthUsername(credential.username)) ? "admin" : "user",
      sites: WIREGENE_ADMIN_SITE_IDS,
    }),
  );
}

export function getAdminUsernamesFromEnv(env: BasicAuthEnv = process.env) {
  return new Set(
    parseAdminUsers(
      [
        normalizeAuthEnvValue(env.WIREGENE_ADMIN_EMAILS),
        normalizeAuthEnvValue(env.APP_ADMIN_USERS),
        normalizeAuthEnvValue(env.APP_ADMIN_USER),
      ].join(","),
    ),
  );
}

export function isAdminUsername(username: string, env: BasicAuthEnv = process.env) {
  return getAdminUsernamesFromEnv(env).has(normalizeAuthUsername(username));
}

export function parseBasicAuthCredential(authorization: string): ProvidedBasicAuthCredential | null {
  const [scheme, encoded] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex < 0) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function normalizeAuthUsername(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeAuthEnvValue(value: string | undefined) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return "";

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseBasicAuthUsers(value: string | undefined): BasicAuthCredential[] {
  if (!value) return [];

  return value.split(",").flatMap((entry) => {
    const trimmedEntry = entry.trim();
    const separatorIndex = trimmedEntry.indexOf(":");

    if (separatorIndex <= 0) return [];

    const username = trimmedEntry.slice(0, separatorIndex).trim();
    const password = trimmedEntry.slice(separatorIndex + 1);

    if (!username || !password) return [];
    return [{ username, password, source: "APP_BASIC_AUTH_USERS" as const }];
  });
}

function parseAdminUsers(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry) => normalizeAuthUsername(entry))
    .filter(Boolean);
}
