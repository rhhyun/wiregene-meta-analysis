"use client";

import {
  Check,
  Database,
  ListChecks,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type PortalSite = {
  id: string;
  label: string;
  shortLabel: string;
  url: string;
};

type AccountSource = "APP_BASIC_AUTH_USER" | "APP_BASIC_AUTH_USERS" | "PORTAL_ACCOUNTS";

type AccountSummary = {
  id?: string;
  username: string;
  email?: string;
  role?: "admin" | "user";
  sites?: string[];
  source: AccountSource;
  passwordConfigured: boolean;
  mustChangePassword?: boolean;
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type SiteAccount = Pick<
  AccountSummary,
  "id" | "username" | "email" | "role" | "source" | "passwordConfigured" | "mustChangePassword" | "disabled"
>;

type SiteAccountList = PortalSite & {
  count: number;
  accounts: SiteAccount[];
};

type AccountState = {
  status: "loading" | "ready" | "error";
  accounts: AccountSummary[];
  sites: PortalSite[];
  siteAccountLists: SiteAccountList[];
  message?: string;
  managedBy?: string;
  writable?: boolean;
};

type TemporaryPasswordState = {
  username: string;
  password: string;
} | null;

export function AccountManagementPanel() {
  const [state, setState] = useState<AccountState>({
    status: "loading",
    accounts: [],
    sites: [],
    siteAccountLists: [],
  });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [selectedSites, setSelectedSites] = useState<string[]>(["portal", "search"]);
  const [temporaryPassword, setTemporaryPassword] = useState<TemporaryPasswordState>(null);
  const [submitting, setSubmitting] = useState(false);

  const managedAccounts = useMemo(
    () => state.accounts.filter((account) => account.source === "PORTAL_ACCOUNTS"),
    [state.accounts],
  );
  const siteAccountLists = useMemo(() => {
    if (state.siteAccountLists.length) return state.siteAccountLists;
    return buildSiteAccountLists(state.sites, state.accounts);
  }, [state.accounts, state.siteAccountLists, state.sites]);
  const environmentAccounts = state.accounts.length - managedAccounts.length;

  async function reloadAccounts() {
    setState((current) => ({ ...current, status: "loading", message: undefined }));
    setState(await getAccountState());
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setTemporaryPassword(null);

    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, role, sites: selectedSites }),
      });
      const payload = (await response.json()) as {
        account?: AccountSummary;
        temporaryPassword?: string;
        error?: string;
      };

      if (!response.ok || !payload.account || !payload.temporaryPassword) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setUsername("");
      setEmail("");
      setRole("user");
      setSelectedSites(["portal", "search"]);
      setTemporaryPassword({
        username: payload.account.username,
        password: payload.temporaryPassword,
      });
      await reloadAccounts();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Account creation failed.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(account: AccountSummary) {
    if (!account.id) return;
    setTemporaryPassword(null);

    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, action: "reset-password" }),
      });
      const payload = (await response.json()) as {
        account?: AccountSummary;
        temporaryPassword?: string;
        error?: string;
      };

      if (!response.ok || !payload.account || !payload.temporaryPassword) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setTemporaryPassword({
        username: payload.account.username,
        password: payload.temporaryPassword,
      });
      await reloadAccounts();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Password reset failed.",
      }));
    }
  }

  useEffect(() => {
    let mounted = true;

    void getAccountState().then((nextState) => {
      if (mounted) setState(nextState);
    });

    return () => {
      mounted = false;
    };
  }, []);

  function toggleSite(siteId: string) {
    setSelectedSites((current) => {
      if (siteId === "portal") return current.includes("portal") ? current : ["portal", ...current];
      if (current.includes(siteId)) return current.filter((item) => item !== siteId);
      return [...current, siteId];
    });
  }

  function changeRole(nextRole: "admin" | "user") {
    setRole(nextRole);
    if (nextRole === "admin") {
      setSelectedSites(state.sites.map((site) => site.id));
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Access Control</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">ID 관리</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Wiregene 서브사이트별 접근 ID와 Portal 계정을 한 곳에서 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reloadAccounts()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            새로고침
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusTile
          icon={<Users className="h-4 w-4" aria-hidden />}
          label="Portal 계정"
          value={`${managedAccounts.length}명`}
        />
        <StatusTile
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          label="환경변수 ID"
          value={`${environmentAccounts}개`}
        />
        <StatusTile
          icon={<ListChecks className="h-4 w-4" aria-hidden />}
          label="서브사이트 목록"
          value={`${siteAccountLists.length}개`}
        />
      </section>

      <SubsiteIdListSection siteAccountLists={siteAccountLists} status={state.status} />

      {temporaryPassword ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-800">임시 비밀번호 발급 완료</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[12rem_1fr]">
            <InfoLine label="ID" value={temporaryPassword.username} />
            <InfoLine label="Temporary PW" value={temporaryPassword.password} strong />
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {state.message}
        </p>
      ) : null}

      {state.writable ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-zinc-950">새 ID 등록</h3>
          <form onSubmit={createAccount} className="mt-4 grid gap-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_10rem]">
              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                ID
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-normal outline-none focus:border-emerald-400"
                  placeholder="wiregene-user"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm font-normal outline-none focus:border-emerald-400"
                  placeholder="name@example.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Role
                <select
                  value={role}
                  onChange={(event) => changeRole(event.target.value === "admin" ? "admin" : "user")}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal outline-none focus:border-emerald-400"
                >
                  <option value="user">사용자</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
            </div>

            <div>
              <p className="text-sm font-semibold text-zinc-700">접근 가능한 사이트</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {state.sites.map((site) => {
                  const checked = selectedSites.includes(site.id);
                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => toggleSite(site.id)}
                      className={`flex h-11 items-center justify-between rounded-md border px-3 text-sm font-semibold transition ${
                        checked
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-200"
                      }`}
                    >
                      {site.shortLabel}
                      {checked ? <Check className="h-4 w-4" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {submitting ? "등록 중" : "ID 생성"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-950">전체 계정 목록</h3>
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              state.status === "error"
                ? "bg-rose-50 text-rose-700"
                : state.status === "loading"
                  ? "bg-zinc-100 text-zinc-600"
                  : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {state.status === "error" ? "오류" : state.status === "loading" ? "확인 중" : "정상"}
          </span>
        </div>

        {state.accounts.length ? (
          <div className="mt-4 grid gap-3">
            {state.accounts.map((account) => (
              <div
                key={`${account.source}:${account.id ?? account.username}`}
                className="grid gap-3 rounded-lg border border-zinc-200 px-4 py-3 lg:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <AccountHeading account={account} />
                  {account.email ? <p className="mt-1 text-xs text-zinc-500">{account.email}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(account.sites ?? []).map((siteId) => (
                      <span key={siteId} className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {siteLabel(siteId, state.sites)}
                      </span>
                    ))}
                  </div>
                </div>
                {state.writable && account.source === "PORTAL_ACCOUNTS" ? (
                  <button
                    type="button"
                    onClick={() => void resetPassword(account)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    PW 재발급
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : state.status === "loading" ? (
          <p className="mt-4 text-sm text-zinc-500">계정 정보를 불러오는 중입니다.</p>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">등록된 계정이 없습니다.</p>
        )}
      </section>
    </div>
  );
}

function SubsiteIdListSection({
  siteAccountLists,
  status,
}: {
  siteAccountLists: SiteAccountList[];
  status: AccountState["status"];
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <Database className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-emerald-700">Subsite ID List</p>
          <h3 className="text-xl font-semibold tracking-normal text-zinc-950">서브사이트별 접근 ID</h3>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {siteAccountLists.map((site) => (
          <div key={site.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-emerald-700">{site.shortLabel}</p>
                <h4 className="mt-1 truncate text-base font-semibold text-zinc-950">{site.label}</h4>
                <p className="mt-1 truncate text-xs text-zinc-500">{formatDomain(site.url)}</p>
              </div>
              <span className="shrink-0 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                {site.count} IDs
              </span>
            </div>

            {site.accounts.length ? (
              <div className="mt-4 max-h-44 space-y-2 overflow-y-auto pr-1">
                {site.accounts.map((account) => (
                  <div
                    key={`${site.id}:${account.source}:${account.id ?? account.username}`}
                    className="rounded-md border border-zinc-100 px-3 py-2"
                  >
                    <AccountHeading account={account} compact />
                    {account.email ? <p className="mt-1 truncate text-xs text-zinc-500">{account.email}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                {status === "loading" ? "확인 중입니다." : "등록된 ID가 없습니다."}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

async function getAccountState(): Promise<AccountState> {
  try {
    const response = await fetch("/api/admin/accounts", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      accounts?: AccountSummary[];
      sites?: PortalSite[];
      siteAccountLists?: SiteAccountList[];
      managedBy?: string;
      writable?: boolean;
    };
    const accounts = payload.accounts ?? [];
    const sites = payload.sites ?? [];

    return {
      status: "ready",
      accounts,
      sites,
      siteAccountLists: payload.siteAccountLists ?? buildSiteAccountLists(sites, accounts),
      managedBy: payload.managedBy ?? "Vercel Environment Variables",
      writable: Boolean(payload.writable),
    };
  } catch (error) {
    return {
      status: "error",
      accounts: [],
      sites: [],
      siteAccountLists: [],
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function buildSiteAccountLists(sites: PortalSite[], accounts: AccountSummary[]): SiteAccountList[] {
  return sites.map((site) => {
    const siteAccounts = accounts
      .filter((account) => account.sites?.includes(site.id))
      .map((account) => ({
        id: account.id,
        username: account.username,
        email: account.email,
        role: account.role,
        source: account.source,
        passwordConfigured: account.passwordConfigured,
        mustChangePassword: account.mustChangePassword,
        disabled: account.disabled,
      }))
      .sort((left, right) => left.username.localeCompare(right.username));

    return {
      ...site,
      count: siteAccounts.length,
      accounts: siteAccounts,
    };
  });
}

function AccountHeading({ account, compact = false }: { account: SiteAccount; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={`${compact ? "text-xs" : "text-sm"} font-semibold text-zinc-950`}>{account.username}</p>
      <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
        {account.source === "PORTAL_ACCOUNTS" ? roleLabel(account.role) : sourceLabel(account.source)}
      </span>
      {account.disabled ? (
        <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">비활성</span>
      ) : null}
      {account.mustChangePassword ? (
        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">PW 변경 필요</span>
      ) : null}
    </div>
  );
}

function StatusTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="truncate text-lg font-semibold text-zinc-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <p className="text-sm font-semibold text-emerald-800">{label}</p>
      <p className={strong ? "font-mono text-sm font-semibold text-zinc-950" : "text-sm text-zinc-800"}>{value}</p>
    </>
  );
}

function siteLabel(siteId: string, sites: PortalSite[]) {
  return sites.find((site) => site.id === siteId)?.shortLabel ?? siteId;
}

function sourceLabel(source: AccountSource) {
  if (source === "APP_BASIC_AUTH_USER") return "ENV";
  if (source === "APP_BASIC_AUTH_USERS") return "ENV LIST";
  return "Portal DB";
}

function roleLabel(role: AccountSummary["role"]) {
  return role === "admin" ? "관리자" : "사용자";
}

function formatDomain(url: string) {
  return url.replace(/^https?:\/\//, "");
}
