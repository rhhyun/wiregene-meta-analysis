# Wiregene Service Repository Split

## Decision

`search.wiregene.com`, `meta.wiregene.com`, and `portal.wiregene.com` should be
operated as separate services rather than as subfolders of
`research-briefing-platform`.

The long-term target is:

```text
GitHub
  rhhyun/research-briefing-platform   search.wiregene.com only
  rhhyun/wiregene-meta-analysis       meta.wiregene.com only
  rhhyun/wiregene-portal              portal.wiregene.com only

Synology source checkouts
  /volume1/docker/research-briefing-platform
  /volume1/docker/wiregene-meta-analysis
  /volume1/docker/wiregene-portal

Synology runtime folders
  /volume1/docker/meta
  /volume1/docker/portal
```

`/volume1/docker/research-briefing-platform` must no longer be the source
folder for `meta` or `portal`. It remains the source folder for
`search.wiregene.com`.

## Why

- A search deployment must not reassign `meta.wiregene.com` or
  `portal.wiregene.com` aliases.
- Synology scheduler tasks should not depend on a shared source checkout.
- Portal account management, meta-analysis workflows, and search/briefing jobs
  have different environment variables and failure modes.
- Each service can be deployed, rolled back, and restarted independently.

## Create Standalone Repositories

Create two empty GitHub repositories:

```text
rhhyun/wiregene-meta-analysis
rhhyun/wiregene-portal
```

Then export the current service source from this repository:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\export-wiregene-service.ps1 `
  -Service meta `
  -TargetDir ..\wiregene-meta-analysis `
  -RepoUrl https://github.com/rhhyun/wiregene-meta-analysis.git `
  -InitGit

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\export-wiregene-service.ps1 `
  -Service portal `
  -TargetDir ..\wiregene-portal `
  -RepoUrl https://github.com/rhhyun/wiregene-portal.git `
  -InitGit
```

Push each exported repository:

```powershell
git -C ..\wiregene-meta-analysis push -u origin main
git -C ..\wiregene-portal push -u origin main
```

## Vercel

After GitHub repositories exist, connect Vercel projects this way:

```text
research-briefing-platform -> rhhyun/research-briefing-platform
wiregene-meta-analysis     -> rhhyun/wiregene-meta-analysis
wiregene-portal            -> rhhyun/wiregene-portal
```

Required production environment values:

```text
wiregene-meta-analysis:
  WIREGENE_APP_MODE=meta
  NEXT_PUBLIC_WIREGENE_APP_MODE=meta
  APP_BASE_URL=https://meta.wiregene.com
  PORTAL_AUTH_CHECK_SECRET=<same value as portal/search>

wiregene-portal:
  WIREGENE_APP_MODE=portal
  NEXT_PUBLIC_WIREGENE_APP_MODE=portal
  APP_BASE_URL=https://portal.wiregene.com
  PORTAL_AUTH_CHECK_SECRET=<same value as search/meta>
  PORTAL_ACCOUNT_STORAGE_PATH=.data/portal-accounts.json

research-briefing-platform:
  WIREGENE_APP_MODE must be empty unless a dedicated search-only deployment is used.
  PORTAL_AUTH_CHECK_SECRET=<same value as portal/meta>
```

Custom domains:

```text
search.wiregene.com -> research-briefing-platform
meta.wiregene.com   -> wiregene-meta-analysis
portal.wiregene.com -> wiregene-portal
```

If a search deployment reclaims `meta.wiregene.com` or `portal.wiregene.com`,
remove those domains from the search project in the Vercel dashboard and attach
them only to the dedicated projects. DNS remains:

```text
A meta.wiregene.com   76.76.21.21
A portal.wiregene.com 76.76.21.21
```

## Synology

Clone or update all three source repositories:

```sh
/bin/sh /volume1/docker/research-briefing-platform/scripts/synology-bootstrap-service-repos.sh
```

If running this script before the new repositories are available, override the
URLs or create the repositories first:

```sh
META_REPO_URL=https://github.com/rhhyun/wiregene-meta-analysis.git \
PORTAL_REPO_URL=https://github.com/rhhyun/wiregene-portal.git \
/bin/sh /volume1/docker/research-briefing-platform/scripts/synology-bootstrap-service-repos.sh
```

Start separated services:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
```

Runtime `.env` defaults now point to separated source folders:

```text
/volume1/docker/meta/.env
  APP_SOURCE_DIR=/volume1/docker/wiregene-meta-analysis

/volume1/docker/portal/.env
  APP_SOURCE_DIR=/volume1/docker/wiregene-portal
```

## Cleanup After Cutover

After both dedicated repositories are live:

- Keep `research-briefing-platform` for search and briefing only.
- Remove `meta/`, `portal/`, and `synology/docker/meta|portal` from the search
  repository in a later cleanup commit.
- Keep only cross-service documentation and portal-auth client code in search.
- Verify all three domains after each deployment:

```powershell
npx vercel inspect https://search.wiregene.com --scope rhhyuns-projects
npx vercel inspect https://meta.wiregene.com --scope rhhyuns-projects
npx vercel inspect https://portal.wiregene.com --scope rhhyuns-projects
```
