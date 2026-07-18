# Synology Meta Service

This package runs `meta.wiregene.com` as a separate Synology Docker service.

## Install / Start From DSM Task Scheduler

See the repository root [DEPLOYMENT.md](../../../DEPLOYMENT.md) for the complete
Wiregene standard. GitHub Actions builds the production image. The NAS must not
run `npm install`, `npm ci`, `npm run build`, or `docker compose build`.

In DSM Task Scheduler, use the existing Meta sync/deploy task and keep it manual
or boot-time. Do not schedule deployment every minute.

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Public operations:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

No argument is equivalent to `--deploy`. All modes use the common
`scripts/synology-deploy.sh` lock/trap/timeout engine. Docker logs use
`max-size: 10m` and `max-file: 3`; scheduler logs are bounded by the deploy
engine. Failed external commands return non-zero.

Site-only defaults live in `synology/docker/meta/deploy.env`: image repository
`ghcr.io/rhhyun/wiregene-meta-analysis` (`main` seed, deploy selects the
Git HEAD `sha-<full-sha>` image), local rollback image
`wiregene-meta-analysis:nas-rollback`, host port `3001`, health path
`/api/health`, total timeout `600s`, health verification `180s`, and deploy log
rotation `10 MB`/`3`. The web container uses limited `on-failure:3`, not an
unbounded `restart: always` loop.

For the first transition from the old source-build container, the engine saves
`docker-compose.legacy-rollback.yml`, verifies the running container already has
its `.next` build artifact, creates a no-build rollback override, and then
atomically records `rollback_mode=legacy` in `.rollback-state`. It probes the
new image without production volumes or a host port before cutover. The same
`--rollback` command restores the saved legacy definition using only those
pre-existing artifacts. Later normal deployments record `rollback_mode=image`
and roll back to the local prebuilt `nas-rollback` tag. See `DEPLOYMENT.md` for
the one-time legacy exception.

If DSM reports a stopped or unhealthy container, do not rebuild dependencies on
the NAS. Verify first:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
docker logs --tail 100 wiregene-meta
```

Inspect the live DSM registrations with:

```sh
/usr/syno/bin/synoschedtask --get
```

Disable any minutely deploy/start task and any task containing raw foreground
servers, follow-mode logs, or NAS-side build commands. Meta deployment must not
start Portal or research briefing jobs.

After deploy, the first command below should produce no output; the second
should show exactly one healthy Meta container:

```sh
ps | grep -E 'synology-(start-meta|deploy)|git .*wiregene-meta-analysis|npm (ci|install|run build)|next dev' | grep -v grep
docker ps --filter name=wiregene-meta
```

On the first run, fill `/volume1/docker/meta/.env`, then run the same command
again.

## Durable Storage Policy

Synology Meta uses NAS local storage as the primary durable store. Google Drive
is optional and should not block local full-text screening work.

The standard host folder is:

```text
/volume1/docker/meta/download
```

The Docker container mounts it at:

```text
/app/download
```

The default structure is:

```text
/volume1/docker/meta/download/
  _system/
    user-study-projects.json
    meta-ai-settings.json
    research-briefing-storage.json
    meta-full-text-history.json
    full-text-files/
  {project}/
    project-workspace-state.json
    full-text-history.json
    full-text-files/
    *.csv, *.json, *.md, *.txt, *.tsv
```

`_system` stores app-wide settings and study lists. Each `{project}` folder
stores that study's protocol/search state, saved CSV/JSON/Markdown files,
full-text history, uploaded PDF/Word source files, reviewer verification, and
AI extraction outputs.

The start script creates `/volume1/docker/meta/download` automatically and
copies legacy files from `/volume1/docker/meta/data` only when the new target
file or folder does not already exist. It does not delete legacy data.

Synology defaults enforced by the start script:

```txt
META_ALLOW_GOOGLE_DRIVE_STORAGE=false
REPORT_STORAGE_BACKEND=local-json
REPORT_STORAGE_LOCAL_PATH=download/_system/research-briefing-storage.json
META_PROJECT_STORAGE_BACKEND=local-json
META_PROJECT_STORAGE_ROOT=download
META_USER_PROJECTS_STORAGE_BACKEND=local-json
META_USER_PROJECTS_FILE=download/_system/user-study-projects.json
META_AI_SETTINGS_STORAGE_BACKEND=local-json
META_AI_SETTINGS_STORAGE_PATH=download/_system/meta-ai-settings.json
META_FULL_TEXT_HISTORY_STORAGE_BACKEND=local-json
META_FULL_TEXT_HISTORY_STORAGE_PATH=download/_system/meta-full-text-history.json
META_FULL_TEXT_SOURCE_STORAGE_BACKEND=local-file
META_FULL_TEXT_SOURCE_STORAGE_PATH=download/_system/full-text-files
```

When a request includes a project id, full-text PDF/Word source files and
history are stored inside `/volume1/docker/meta/download/{project}`. The
`download/_system/full-text-files` path is only a fallback for legacy or
unscoped requests.

If the first run stops with `No complete Basic Auth credential found`, use one
of the following.

Migrate auth values from an existing Synology search/briefing environment:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Or seed a new Basic Auth pair without editing the file manually:

```text
# Set these in /volume1/docker/meta/.env, never in a shared scheduler command.
APP_BASIC_AUTH_USER=YOUR_LOGIN_ID
APP_BASIC_AUTH_PASSWORD=YOUR_PASSWORD
WIREGENE_ADMIN_EMAILS=YOUR_ADMIN_EMAIL
```

If you do not want a local Meta Basic Auth password in `/volume1/docker/meta/.env`,
use portal central authentication instead:

```txt
PORTAL_AUTH_CHECK_SECRET=YOUR_SHARED_PORTAL_AUTH_CHECK_SECRET
PORTAL_AUTH_CHECK_URL=https://portal.wiregene.com/api/auth/check
```

The Synology start script accepts this as the authentication guard even when
`APP_BASIC_AUTH_USER` and `APP_BASIC_AUTH_PASSWORD` are empty.
It also tries to copy an existing auth secret from common runtime files such as
`/volume1/docker/portal/.env`. If no auth value is found, it warns and starts
the container instead of stopping the deployment.

For accurate full-text article screening/extraction, set an OpenAI API key in
`/volume1/docker/meta/.env` or seed it once through the scheduler environment.
With OpenAI enabled, the assistant also returns a Hyunlab-style quality review
with score, grade, improvement guidance, and criteria-level checks:

```text
# Set these in /volume1/docker/meta/.env, then run --deploy.
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5-nano
```

If `OPENAI_API_KEY` is empty, the full-text assistant still runs but uses
fallback rules only, marks the result as `aiUsed=false`, and records a low
quality-review score requiring human verification.

Meta administrators can also save the OpenAI key/model from the in-app
**AI 평가 설정** menu. The saved key is encrypted in
`META_AI_SETTINGS_STORAGE_PATH` and takes priority over `OPENAI_API_KEY`.
Set `META_AI_SETTINGS_SECRET` to a stable secret so saved keys remain readable
after Basic Auth password changes.
This file is saved by the Meta AI settings storage directly and does not depend
on `REPORT_STORAGE_BACKEND` or `GRANT_STORAGE_BACKEND`.

On Vercel/serverless deployments, the local filesystem under `/var/task` is
read-only. To save the key from the in-app settings panel there, configure
`META_AI_SETTINGS_STORAGE_BACKEND=google-drive` with Google Drive OAuth
variables (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
`GOOGLE_DRIVE_REFRESH_TOKEN`) or a service account plus `GOOGLE_DRIVE_FOLDER_ID`.
If in-app key storage is not needed on Vercel, set `OPENAI_API_KEY` directly as a
deployment environment variable.

Full-text PDF/Word analysis results are saved automatically after each run.
Saved records include the analysis JSON, source sheet metadata, AI warning/source,
source-file checksum/path, reviewer verification fields, and extraction review
fields. On Synology these records are stored per project under
`/volume1/docker/meta/download/{project}`. On Vercel, the history storage uses
Google Drive automatically when Google Drive credentials are configured, or it
can be forced with `META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive`. The
default Drive file is `meta-full-text-history.json`.

For multi-PC meta-analysis project editing on the same NAS-backed service, use
the Synology site and keep `/volume1/docker/meta/download` backed up. For
Vercel/cross-site sharing with `search.wiregene.com` or `omni.wiregene.com`,
Google Drive storage can still be enabled intentionally in
`/volume1/docker/meta/.env`:

```sh
META_USER_PROJECTS_STORAGE_BACKEND=google-drive
META_USER_PROJECTS_DRIVE_FILENAME=meta-user-study-projects.json
META_PROJECT_STORAGE_BACKEND=google-drive
META_PROJECT_DRIVE_PREFIX=meta-projects
```

From app `Ver 1.75`, the shared study registry also stores study visibility
state. Same-title studies are deduplicated, archived studies are hidden from the
default active list, and soft-deleted studies do not reappear on another PC.

The per-study shared state file is `project-workspace-state.json`; it stores the
protocol draft, selected databases, DB query overrides, search import rows, and
screening workbook board. Other services can discover project endpoints at
`/api/meta-analysis/workspace/manifest`.

If port `3001` is already used, the deploy stops safely before changing the
unrelated owner. Do not use automatic port-owner stopping in a scheduled task.
Identify the owner, resolve it separately, or configure a free port in
`/volume1/docker/meta/.env`.

```text
HOST_PORT=3003
```

Then deploy and verify:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

The default service listens on host port `3001`.

## Required Source

The shared GitHub source should exist at:

```text
/volume1/docker/wiregene-meta-analysis
```

Change `APP_SOURCE_DIR` in `.env` if the checkout lives elsewhere.
