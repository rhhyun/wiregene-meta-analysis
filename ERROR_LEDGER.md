# Error Ledger

## 2026-06-30 - SYNOLOGY_META_ONE_MINUTE_STOP_ALARM

- Error code: `SYNOLOGY_META_ONE_MINUTE_STOP_ALARM`
- Symptom: Synology DSM repeatedly reports that `wiregene-meta` stopped unexpectedly, often at one-minute intervals and across client PCs.
- Root cause: A DSM Task Scheduler job can run the Meta start command every minute. Older startup flow used forced Docker recreation, and any repeated start/recreate or crash-loop can produce DSM container stop notifications. This is a NAS runtime/scheduler issue, not a browser-PC issue.
- Correct fix: Keep `scripts/synology-start-meta.sh` for manual deployment, boot-time start, or intentional restart only. For one-minute monitoring, run `scripts/synology-meta-watchdog.sh`, which exits `0`, does not recreate a healthy running container, and restarts only when the container is missing or stopped.
- Prevention rule: Do not use `docker compose up --force-recreate` in periodic DSM tasks. Periodic DSM tasks must be diagnostic/watchdog tasks that log errors and exit successfully unless a human intentionally runs a deployment/rebuild command.
- Verification command: `bash -n scripts/synology-start-meta.sh`; `bash -n scripts/synology-meta-status.sh`; `bash -n scripts/synology-meta-watchdog.sh`; run the watchdog on Synology and inspect `/volume1/docker/meta/logs/meta-watchdog.log`.
- Affected files: `scripts/synology-start-meta.sh`; `scripts/synology-meta-status.sh`; `scripts/synology-meta-watchdog.sh`; `SERVICE.md`; `synology/docker/meta/README.md`; `synology/docker/meta/.env.example`.

## 2026-06-29 - GOOGLE_OAUTH_INVALID_GRANT

- Error code: `GOOGLE_OAUTH_INVALID_GRANT`
- Symptom: Screening full-text history or Included-paper Excel dataset failed with `Google Drive OAuth is unavailable`, blocking reads from `google-drive:meta-projects__...`.
- Root cause: The deployed Google Drive refresh token is invalid, expired, revoked, or mismatched with the OAuth client/env currently used by the app. Application code cannot make an invalid refresh token valid again.
- Correct fix: Reconnect Google Drive through `/api/google-drive/oauth/start?diagnose=1`, update the production `GOOGLE_DRIVE_REFRESH_TOKEN` and matching Google Drive OAuth env vars when required, then redeploy/restart the target runtime.
- Prevention rule: Recoverable Google Drive/OAuth read failures must render a guarded `storage.unavailable` state, never a destructive empty shared dataset. Browser cache may be shown only as a read-only last snapshot. All write actions that could modify full-text history, source files, AI reruns, reviewer settings, verification, deletes, or extraction exports must remain blocked until shared storage reconnects. If a nested API payload still contains Google Drive OAuth diagnostics, the UI must replace raw `operation/path/backend/message/help` details with the controlled reconnect message.
- Operations rule: Do not treat a repeated `GOOGLE_OAUTH_INVALID_GRANT` after deployment as a UI regression unless `/api/meta-analysis/storage-policy?googleDriveHealth=1` proves Drive health is green. Code can suppress destructive behavior and raw diagnostics, but only a newly issued refresh token matching the deployed OAuth client can restore Drive access.
- Secret rule: OAuth repair files (`credentials.json`, `token.json`, local helper scripts, pulled Vercel env files) must stay untracked. If such files enter an unpushed local commit, remove the local commit before pushing.
- Verification command: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint`; `npm.cmd run build`; `git diff --check`.
- Affected files: `src/app/api/meta-analysis/full-text/history/route.ts`; `src/app/api/meta-analysis/extraction-dataset/route.ts`; `src/components/MetaFullTextAssistant.tsx`; `src/components/MetaExtractionDatasetPanel.tsx`; `scripts/google-drive-oauth.ts`; `AUTH_RUNBOOK.md`; `.gitignore`.
