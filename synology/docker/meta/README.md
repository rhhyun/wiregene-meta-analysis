# Synology Meta Service

This package runs `meta.wiregene.com` as a separate Synology Docker service.

## Install / Start From DSM Task Scheduler

Use this bootstrap command when the NAS source checkout may be missing or stale.
It clones/pulls `rhhyun/wiregene-meta-analysis` first, then runs the service
start script.

```sh
/bin/sh -c 'set -eu; export PATH="/usr/local/bin:/usr/bin:/bin:/var/packages/Git/target/bin:/volume1/@appstore/Git/bin:$PATH"; SRC="/volume1/docker/wiregene-meta-analysis"; REPO="https://github.com/rhhyun/wiregene-meta-analysis.git"; command -v git >/dev/null 2>&1 || { echo "git command not found. Install Synology Git package, then rerun."; exit 1; }; mkdir -p /volume1/docker; if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only origin main; elif [ -e "$SRC" ]; then echo "$SRC exists but is not a git checkout. Move it aside or clone the repo there."; exit 1; else git clone "$REPO" "$SRC"; fi; /bin/sh "$SRC/scripts/synology-start-meta.sh"'
```

The direct command below works only after `/volume1/docker/wiregene-meta-analysis`
is already a current Git checkout.

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

On the first run, fill `/volume1/docker/meta/.env`, then run the same command
again.

If the first run stops with `No complete Basic Auth credential found`, use one
of the following.

Migrate auth values from an existing Synology search/briefing environment:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Or seed a new Basic Auth pair without editing the file manually:

```sh
APP_BASIC_AUTH_USER='YOUR_LOGIN_ID' APP_BASIC_AUTH_PASSWORD='YOUR_PASSWORD' WIREGENE_ADMIN_EMAILS='YOUR_ADMIN_EMAIL' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

If you do not want a local Meta Basic Auth password in `/volume1/docker/meta/.env`,
use portal central authentication instead:

```txt
PORTAL_AUTH_CHECK_SECRET=YOUR_SHARED_PORTAL_AUTH_CHECK_SECRET
PORTAL_AUTH_CHECK_URL=https://portal.wiregene.com/api/auth/check
```

The Synology start script accepts this as the authentication guard even when
`APP_BASIC_AUTH_USER` and `APP_BASIC_AUTH_PASSWORD` are empty.

For accurate full-text article screening/extraction, set an OpenAI API key in
`/volume1/docker/meta/.env` or seed it once through the scheduler environment.
With OpenAI enabled, the assistant also returns a Hyunlab-style quality review
with score, grade, improvement guidance, and criteria-level checks:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && OPENAI_API_KEY='YOUR_OPENAI_API_KEY' OPENAI_MODEL='gpt-5-nano' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
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
and reviewer verification fields. On Vercel, the history storage uses Google
Drive automatically when Google Drive credentials are configured, or it can be
forced with `META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive`. The default
Drive file is `meta-full-text-history.json`.

For multi-PC meta-analysis project editing, keep the study registry and the
project workspace state in shared storage. Synology local storage is acceptable
for one NAS-backed internal deployment. For cross-PC/Vercel/cross-site sharing
with `search.wiregene.com` or `omni.wiregene.com`, set Google Drive storage in
`/volume1/docker/meta/.env`:

```sh
META_USER_PROJECTS_STORAGE_BACKEND=google-drive
META_USER_PROJECTS_DRIVE_FILENAME=meta-user-study-projects.json
META_PROJECT_STORAGE_BACKEND=google-drive
META_PROJECT_DRIVE_PREFIX=meta-projects
```

The per-study shared state file is `project-workspace-state.json`; it stores the
protocol draft, selected databases, DB query overrides, search import rows, and
screening workbook board. Other services can discover project endpoints at
`/api/meta-analysis/workspace/manifest`.

If port `3001` is already used, the script prints the running container that
owns the port and stops before changing anything. If that old container should
be replaced by Meta, rerun:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && META_STOP_PORT_OWNER=true /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

To test Meta on another temporary port instead:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && HOST_PORT=3003 /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

The default service listens on host port `3001`.

## Required Source

The shared GitHub source should exist at:

```text
/volume1/docker/wiregene-meta-analysis
```

Change `APP_SOURCE_DIR` in `.env` if the checkout lives elsewhere.
