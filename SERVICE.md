# Wiregene Meta

Standalone repository exported from `research-briefing-platform`.

## Service Boundary

- Host: https://meta.wiregene.com
- App mode: meta
- Synology source directory: /volume1/docker/wiregene-meta-analysis
- Runtime directory: /volume1/docker/meta

The source is intentionally copied rather than shared with `search.wiregene.com`
so deployments, Vercel aliases, Synology containers, and environment variables
cannot overwrite each other.

## First Commit

```powershell
git init
git add .
git commit -m "Initialize Wiregene Meta standalone app"
git branch -M main
git remote add origin https://github.com/rhhyun/wiregene-meta-analysis.git
git push -u origin main
```

Set `WIREGENE_APP_MODE=meta` in Vercel and Synology.

## Synology DSM Task Scheduler

The authoritative deployment standard is [DEPLOYMENT.md](DEPLOYMENT.md). Meta
uses a prebuilt production image. GitHub Actions performs dependency install and
build; the NAS performs image pull, detached Compose start, and health
verification only.

Use the existing Meta sync/deploy task in DSM Task Scheduler. Set it to manual
or boot-time, never every minute. Its complete command must be one line:

Run it after the GitHub `Container image` workflow has published the current
commit's `sha-<full-sha>` image. If the image is not ready, deploy fails before
replacing the current container.

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

The public interface is:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

No argument is equivalent to `--deploy`. The wrapper delegates common lock,
trap, timeout, Docker path discovery, pull/up, health, log, and rollback behavior
to `scripts/synology-deploy.sh`. A failure returns non-zero. Persistent data and
the runtime `.env` are never pruned as part of deploy or rollback.

Meta's site-only values are in `synology/docker/meta/deploy.env`: GHCR image,
runtime paths, container, host port `3001`, `/api/health`, and deployment
deadlines. Common policy remains in the engine and is not duplicated per site.

On the first migration from the old source-mounted Node container, deploy saves
`/volume1/docker/meta/docker-compose.legacy-rollback.yml`, verifies the running
container already has a usable `.next` artifact, creates a no-build rollback
override, and atomically records `rollback_mode=legacy` in
`/volume1/docker/meta/.rollback-state`. It probes the new image in a unique
isolated container with no volume or host port before touching production. A
failed probe leaves the old production container unchanged. `--rollback`
automatically uses the saved legacy compose and existing build artifact for
this first transition; after a later normal image deployment records
`rollback_mode=image`, the same command uses the local
`wiregene-meta-analysis:nas-rollback` application image instead. See
`DEPLOYMENT.md` for the exact distinction.

If DSM reports `wiregene-meta` stopped unexpectedly, run verify-only once and
inspect the bounded deployment log and recent Docker log:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
docker logs --tail 100 wiregene-meta
```

Do not add `git pull` to a one-minute monitor and do not run deploy periodically.
To inspect the actual DSM registrations, run:

```sh
/usr/syno/bin/synoschedtask --get
```

Disable any task that runs raw `docker compose up`, `npm install`, `npm run
build`, `docker compose build`, `docker logs -f`, `tail -f`, or
`synology-start-meta.sh` every minute. Portal, briefing, worker, queue, and
migration work must use separate tasks.

After deployment, no scheduler shell, Git, npm, or build process should remain:

```sh
ps | grep -E 'synology-(start-meta|deploy)|git .*wiregene-meta-analysis|npm (ci|install|run build)|next dev' | grep -v grep
docker ps --filter name=wiregene-meta
```

The first command must have no output. The second must show one healthy Meta
container. The container is the intended long-running service; scheduler child
processes are not.

## Authentication and AI Configuration

Keep secrets in `/volume1/docker/meta/.env`, not in the Task Scheduler command.
If existing authentication values must be migrated, run the migration helper
once, then deploy:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Alternatively, Meta can rely on `portal.wiregene.com` central authentication.
In that case `/volume1/docker/meta/.env` does not need a local
`APP_BASIC_AUTH_PASSWORD`, but it must include:

```txt
PORTAL_AUTH_CHECK_SECRET=YOUR_SHARED_PORTAL_AUTH_CHECK_SECRET
PORTAL_AUTH_CHECK_URL=https://portal.wiregene.com/api/auth/check
```

The secret must match the one configured on `portal.wiregene.com`.
If the secret already exists in a common runtime file such as
`/volume1/docker/portal/.env`, the Synology start script attempts to copy it
into `/volume1/docker/meta/.env` automatically. If no auth value is found, the
script now starts the container with a warning instead of blocking deployment;
configure authentication before exposing the service publicly.

For full-text article screening/extraction accuracy, set `OPENAI_API_KEY` and
`OPENAI_MODEL` in the runtime `.env`, then run `--deploy`. Without an API key,
the full-text assistant uses conservative fallback rules and requires human
verification.

Meta administrators can also open **AI 평가 설정** inside `meta.wiregene.com`
and save the OpenAI key/model there. The saved key is encrypted in
`META_AI_SETTINGS_STORAGE_PATH` and is used before the environment
`OPENAI_API_KEY`. Set `META_AI_SETTINGS_SECRET` to a stable secret so encrypted
keys remain readable after Basic Auth password changes.
This settings file is written by the Meta AI settings storage directly and does
not inherit `REPORT_STORAGE_BACKEND` or `GRANT_STORAGE_BACKEND`.

On Vercel/serverless deployments, the local filesystem under `/var/task` is
read-only. To save the key from the in-app settings panel there, configure
`META_AI_SETTINGS_STORAGE_BACKEND=google-drive` together with Google Drive
OAuth variables (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
`GOOGLE_DRIVE_REFRESH_TOKEN`) or a service account plus `GOOGLE_DRIVE_FOLDER_ID`.
If you do not want in-app key storage on Vercel, set `OPENAI_API_KEY` directly as
a deployment environment variable instead.

Full-text PDF/Word analysis results are saved automatically after each run.
Saved records include the analysis JSON, source sheet metadata, AI warning/source,
and reviewer verification fields. On Vercel, the history storage uses Google
Drive automatically when Google Drive credentials are configured, or it can be
forced with `META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive`. The default
Drive file is `meta-full-text-history.json`.

## Meta Project File Storage

Screening/search CSV exports and each study's shared workspace state are not
written as files until the in-app `Save ...` or shared-state buttons are
clicked. Saved project files are written by the Next.js server under:

```txt
.data/meta/projects/{projectId}/
```

In the Synology Docker package this path is bind-mounted to:

```txt
/volume1/docker/meta/data/projects/{projectId}/
```

Set `META_PROJECT_STORAGE_ROOT` only to a writable path visible inside the
container. The default `.data/meta/projects` is recommended for Synology because
it stays inside the existing `/volume1/docker/meta/data` runtime volume.

For multi-PC editing, Vercel/serverless use, or cross-service integration with
`search.wiregene.com` / `omni.wiregene.com`, configure:

```txt
META_PROJECT_STORAGE_BACKEND=google-drive
META_PROJECT_DRIVE_PREFIX=meta-projects
```

with Google Drive credentials. The project state is saved as
`project-workspace-state.json` under the project storage backend. It currently
contains PRISMA protocol draft fields, selected search databases, database query
overrides, search import rows, and the screening workbook board. Text exports
can be downloaded through:

```txt
/api/meta-analysis/projects/{projectId}/files/{fileName}
```

Other Wiregene services can discover available studies and endpoints through:

```txt
/api/meta-analysis/workspace/manifest
```

## Shared Meta Study List Storage

The left-menu study list is a project registry, not a CSV/export file. It is
stored separately from `META_PROJECT_STORAGE_ROOT`.

- Local/Synology default: `META_USER_PROJECTS_STORAGE_BACKEND=local-json` with
  `META_USER_PROJECTS_FILE=.data/meta/user-study-projects.json`.
- Vercel/serverless or multi-PC sharing: set
  `META_USER_PROJECTS_STORAGE_BACKEND=google-drive` plus Google Drive
  credentials. The default Drive file name is `meta-user-study-projects.json`.
- If a study exists only in one browser's localStorage, open that PC once after
  the shared backend is configured. The app merges the browser list back into
  the shared project registry.
- From app `Ver 1.75`, the study registry deduplicates same-title topics in
  addition to same-id topics. If a duplicate title is loaded from localStorage or
  shared storage, the app writes the cleaned list back through
  `/api/meta-analysis/projects`.
- From app `Ver 1.75`, study cards support `archive`, `restore`, and
  soft-delete visibility states. Archived and deleted studies are hidden from the
  default active study list on every PC that reads the shared registry.
