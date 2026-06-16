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

Use the bootstrap command below when the NAS source checkout may be missing or
stale. It clones or pulls the GitHub repo first, then starts the Docker service.

```sh
/bin/sh -c 'set -eu; export PATH="/usr/local/bin:/usr/bin:/bin:/var/packages/Git/target/bin:/volume1/@appstore/Git/bin:$PATH"; SRC="/volume1/docker/wiregene-meta-analysis"; REPO="https://github.com/rhhyun/wiregene-meta-analysis.git"; command -v git >/dev/null 2>&1 || { echo "git command not found. Install Synology Git package, then rerun."; exit 1; }; mkdir -p /volume1/docker; if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only origin main; elif [ -e "$SRC" ]; then echo "$SRC exists but is not a git checkout. Move it aside or clone the repo there."; exit 1; else git clone "$REPO" "$SRC"; fi; /bin/sh "$SRC/scripts/synology-start-meta.sh"'
```

If the start script reports missing Basic Auth values, first pull the latest
scripts, then choose one:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

```sh
APP_BASIC_AUTH_USER='YOUR_LOGIN_ID' APP_BASIC_AUTH_PASSWORD='YOUR_PASSWORD' WIREGENE_ADMIN_EMAILS='YOUR_ADMIN_EMAIL' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

For full-text article screening/extraction accuracy, configure OpenAI. When
enabled, the full-text workflow uses OpenAI Structured Outputs to produce both
the eligibility/extraction draft and a Hyunlab-style quality review
(`score`, `grade`, `summary`, `improvement`, and criteria-level comments).

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && OPENAI_API_KEY='YOUR_OPENAI_API_KEY' OPENAI_MODEL='gpt-5-nano' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Without `OPENAI_API_KEY`, the full-text assistant uses conservative fallback
rules, marks the result `aiUsed=false`, and assigns a low quality-review score
requiring human verification.

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
