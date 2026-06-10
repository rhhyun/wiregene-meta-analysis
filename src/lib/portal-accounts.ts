import crypto from "crypto";
import { promisify } from "util";
import { createGrantJsonStorage } from "./grant-storage";

const scrypt = promisify(crypto.scrypt);

export const portalSites = [
  {
    id: "portal",
    label: "Portal",
    shortLabel: "Portal",
    url: "https://portal.wiregene.com",
  },
  {
    id: "search",
    label: "Research Search",
    shortLabel: "Search",
    url: "https://search.wiregene.com",
  },
  {
    id: "meta",
    label: "Meta-analysis",
    shortLabel: "Meta",
    url: "https://meta.wiregene.com",
  },
  {
    id: "hyunlab",
    label: "HyunLab Wiregene Platform",
    shortLabel: "HW ERP",
    url: "https://hyunlab.wiregene.com",
  },
  {
    id: "sci-experiment",
    label: "SCI Experiment",
    shortLabel: "SCI EXP",
    url: "https://sci-experiment.wiregene.com",
  },
  {
    id: "behavior",
    label: "SCI BBB AI",
    shortLabel: "SCI BBB AI",
    url: "https://sci-bbb.wiregene.com",
  },
  {
    id: "human",
    label: "ARIM Human",
    shortLabel: "Human",
    url: "https://arim.wiregene.com",
  },
] as const;

export type PortalSiteId = (typeof portalSites)[number]["id"];
export type PortalRole = "admin" | "user";

export type PortalAccount = {
  id: string;
  username: string;
  email: string;
  role: PortalRole;
  sites: PortalSiteId[];
  passwordHash: string;
  mustChangePassword: boolean;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type PortalAccountData = {
  accounts: PortalAccount[];
};

export type PortalAccountSummary = Omit<PortalAccount, "passwordHash"> & {
  passwordConfigured: boolean;
  source: "PORTAL_ACCOUNTS";
};

const portalAccountStorage = createGrantJsonStorage<PortalAccountData>({
  envName: "PORTAL_ACCOUNT_STORAGE_PATH",
  defaultRelativePath: ".data/portal-accounts.json",
  label: "portal account",
  emptyData: () => ({ accounts: [] }),
  normalize: normalizePortalAccountData,
});

export function portalSiteIds() {
  return portalSites.map((site) => site.id);
}

export async function listPortalAccountSummaries() {
  const data = await portalAccountStorage.read();
  return data.accounts
    .map(toSummary)
    .sort((left, right) => left.username.localeCompare(right.username));
}

export async function createPortalAccount(input: {
  username: string;
  email?: string;
  role?: PortalRole;
  sites?: string[];
}) {
  const data = await portalAccountStorage.read();
  const username = normalizeUsername(input.username);

  if (!username) throw new Error("Username is required.");
  if (data.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
    throw new Error(`Account already exists: ${username}`);
  }

  const now = new Date().toISOString();
  const temporaryPassword = generateTemporaryPassword();
  const role = input.role === "admin" ? "admin" : "user";
  const account: PortalAccount = {
    id: crypto.randomUUID(),
    username,
    email: normalizeEmail(input.email),
    role,
    sites: role === "admin" ? portalSiteIds() : normalizeSites(input.sites),
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };

  data.accounts.push(account);
  await portalAccountStorage.write(data);

  return {
    account: toSummary(account),
    temporaryPassword,
  };
}

export async function resetPortalAccountPassword(accountId: string) {
  const data = await portalAccountStorage.read();
  const account = data.accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new Error("Account not found.");

  const temporaryPassword = generateTemporaryPassword();
  account.passwordHash = await hashPassword(temporaryPassword);
  account.mustChangePassword = true;
  account.updatedAt = new Date().toISOString();

  await portalAccountStorage.write(data);

  return {
    account: toSummary(account),
    temporaryPassword,
  };
}

export async function verifyPortalAccountCredentials(input: {
  username: string;
  password: string;
  site: string;
}) {
  const data = await portalAccountStorage.read();
  const username = normalizeUsername(input.username);
  const site = input.site as PortalSiteId;
  const account = data.accounts.find(
    (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
  );

  if (!account || account.disabled || !account.sites.includes(site)) {
    return null;
  }

  const verified = await verifyPassword(input.password, account.passwordHash);
  if (!verified) return null;

  return toSummary(account);
}

function normalizePortalAccountData(value: unknown): PortalAccountData {
  const partial = typeof value === "object" && value !== null ? (value as Partial<PortalAccountData>) : {};
  const accounts = Array.isArray(partial.accounts) ? partial.accounts : [];

  return {
    accounts: accounts.flatMap((account) => normalizePortalAccount(account)),
  };
}

function normalizePortalAccount(value: unknown): PortalAccount[] {
  if (typeof value !== "object" || value === null) return [];
  const account = value as Partial<PortalAccount>;
  const username = normalizeUsername(account.username);
  const passwordHash = typeof account.passwordHash === "string" ? account.passwordHash : "";
  if (!username || !passwordHash) return [];

  const now = new Date().toISOString();
  const role = account.role === "admin" ? "admin" : "user";
  return [
    {
      id: typeof account.id === "string" && account.id ? account.id : crypto.randomUUID(),
      username,
      email: normalizeEmail(account.email),
      role,
      sites: role === "admin" ? portalSiteIds() : normalizeSites(account.sites),
      passwordHash,
      mustChangePassword: Boolean(account.mustChangePassword),
      disabled: Boolean(account.disabled),
      createdAt: typeof account.createdAt === "string" ? account.createdAt : now,
      updatedAt: typeof account.updatedAt === "string" ? account.updatedAt : now,
    },
  ];
}

function toSummary(account: PortalAccount): PortalAccountSummary {
  const { passwordHash: _passwordHash, ...summary } = account;
  return {
    ...summary,
    passwordConfigured: Boolean(_passwordHash),
    source: "PORTAL_ACCOUNTS",
  };
}

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "_").slice(0, 64) : "";
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.includes("@") ? email.slice(0, 160) : "";
}

function normalizeSites(value: unknown): PortalSiteId[] {
  const allowed = new Set(portalSiteIds());
  const requested = Array.isArray(value) ? value : ["portal"];
  const sites = requested.filter((site): site is PortalSiteId => typeof site === "string" && allowed.has(site as PortalSiteId));
  return Array.from(new Set<PortalSiteId>(["portal", ...sites]));
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, expectedValue] = passwordHash.split(":");
  if (scheme !== "scrypt" || !salt || !expectedValue) return false;

  const expected = Buffer.from(expectedValue, "base64url");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function generateTemporaryPassword() {
  return `Wg-${crypto.randomBytes(12).toString("base64url")}`;
}
