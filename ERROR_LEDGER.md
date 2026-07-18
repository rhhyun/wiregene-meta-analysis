# Error Ledger

## 2026-07-18 - SYNOLOGY_SCHEDULER_TASK_NEVER_FINISHES

- Error code: `SYNOLOGY_SCHEDULER_TASK_NEVER_FINISHES`
- Symptom: DSM reports `Scheduled Task skipped because the task was already running`; after repeated Wiregene deploy tasks, Task Scheduler edit/save can also stop responding until reboot.
- Root cause: the former Meta runtime built the Next.js app on the NAS, deploy commands had no overall timeout, scheduler log and Docker log growth was unbounded, periodic watchdog commands performed Git/deploy work, and the directory lock cleanup attempted `rmdir` while its PID file still existed. Legacy host `nohup` and combined Meta/Portal/briefing instructions also blurred the service boundary.
- Correct fix: GitHub Actions builds an immutable production image. DSM runs only `scripts/synology-start-meta.sh --deploy`, which delegates to `scripts/synology-deploy.sh` for lock/trap/timeout, Docker path discovery, `docker compose pull`, `docker compose up -d --remove-orphans`, bounded logs, container/health URL verification, and rollback recording.
- First-migration guard: A legacy source-build container cannot be rolled back by tagging its generic Node base image. Preserve `docker-compose.legacy-rollback.yml`, verify its existing `.next` artifact, create a no-build `next start` override, atomically record `rollback_mode=legacy`, and require an isolated no-volume/no-host-port image probe before production cutover. Later image deployments use `rollback_mode=image` and the local `nas-rollback` tag.
- Prevention rule: deploy is manual or boot-time, never minutely. Monitor, Portal, briefing, worker, queue, and migration tasks are independent. Never run NAS-side npm/build, follow-mode logs, host `nohup` servers, destructive prune, `compose down -v`, or automatic data deletion from a deploy task.
- Rollback command: `/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback`.
- Verification command: `/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only`; `/usr/syno/bin/synoschedtask --get`; confirm no scheduler shell/Git/npm/build child remains after deploy.
- Affected files: `scripts/synology-deploy.sh`; `scripts/synology-start-meta.sh`; `synology/docker/meta/deploy.env`; `synology/docker/meta/docker-compose.yml`; `.github/workflows/container-image.yml`; `DEPLOYMENT.md`; Synology deployment documentation.

## 2026-07-01 - GOOGLE_OAUTH_REPAIR_HEADERS_SENT_AFTER_TOKEN_SUCCESS

- Error code: `GOOGLE_OAUTH_REPAIR_HEADERS_SENT_AFTER_TOKEN_SUCCESS`
- Symptom: `npm.cmd run google-drive:oauth:vercel` successfully verifies a new Google Drive refresh token and saves `google-drive-refresh-token.local.txt`, then crashes with `ERR_HTTP_HEADERS_SENT: Cannot write headers after they are sent to the client` immediately after `Applying verified Google Drive OAuth values to Vercel Production.`
- Root cause: The local OAuth callback handler sent a 200 browser response immediately after token verification, then continued Vercel env/deploy work inside the same `try` block. If Vercel apply failed, the catch block attempted to send a 500 response after headers had already been sent, masking the real Vercel apply error and stopping the process before env values were written.
- Correct fix: Send the HTTP callback response only after Vercel apply/deploy completes, and guard the catch block with `response.headersSent`. Add `--apply-saved-token` so a token that was already verified and saved can be applied without repeating Google OAuth consent.
- Prevention rule: Local OAuth callback scripts must not perform long post-response operations in the same error path unless the catch block is headers-sent aware. Persisted verified tokens should have an idempotent apply path.
- Verification command: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint`; `npm.cmd run google-drive:oauth:vercel:apply-saved`.
- Affected files: `scripts/google-drive-oauth.ts`; `package.json`; `AUTH_RUNBOOK.md`.

Follow-up fix: the same repair script initially resolved `vercelScope` with
`argValue("--scope") ?? process.env.VERCEL_SCOPE ?? "rhhyuns-projects"`.
Because `argValue("--scope")` returns an empty string when the flag is absent,
the command became `vercel env add ... --scope ` and failed. The fallback now
uses `argValue("--scope") || process.env.VERCEL_SCOPE || "rhhyuns-projects"`.

Windows CLI fix: `spawnSync("npx.cmd", ..., { input })` failed with
`spawnSync npx.cmd EINVAL` while direct PowerShell piping worked. The Vercel CLI
wrapper now uses the Windows shell for commands that need stdin.

## 2026-07-01 - GOOGLE_OAUTH_LOCAL_REPAIR_INVALID_REQUEST

- Error code: `GOOGLE_OAUTH_LOCAL_REPAIR_INVALID_REQUEST`
- Symptom: `npm.cmd run google-drive:oauth:vercel` opens the local Google OAuth URL and waits for callback, but then fails with `Token exchange failed: Google Drive OAuth is unavailable. Diagnostic code: GOOGLE_OAUTH_INVALID_REQUEST.`
- Root cause: The repair script loaded `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET` from local `credentials.json` for the authorization-code exchange, but the subsequent refresh-token verification called `refreshGoogleDriveOauthAccessToken(payload.refresh_token)` without passing those same client credentials. When the shell env did not contain Google Drive OAuth values, verification retried with empty client id/secret and Google returned `invalid_request`.
- Correct fix: Verify the newly issued refresh token with the same client id/secret used for code exchange: `refreshGoogleDriveOauthAccessToken(payload.refresh_token, { clientId, clientSecret })`.
- Prevention rule: OAuth repair scripts must treat client id, client secret, and refresh token as an inseparable credential set during exchange, verification, Vercel env update, and deployment. Never mix local fallback credentials with empty runtime env during verification.
- Verification command: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint`; rerun `npm.cmd run google-drive:oauth:vercel`.
- Affected files: `scripts/google-drive-oauth.ts`.

## 2026-07-01 - GOOGLE_OAUTH_RECONNECT_NOT_APPLIED_TO_PRODUCTION

- Error code: `GOOGLE_OAUTH_RECONNECT_NOT_APPLIED_TO_PRODUCTION`
- Symptom: User repeatedly reconnects Google Drive OAuth, but Screening continues to report `GOOGLE_OAUTH_INVALID_GRANT` or Google Drive unavailable.
- Root cause: The OAuth callback can issue and verify a new refresh token, but it does not automatically change Vercel Production environment variables. Production can therefore keep running with old, empty, or mismatched Google Drive credentials. In the 2026-07-01 check, Vercel Production had Meta storage backends set to `google-drive` while `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, and Drive target values were empty; the local `token.json` refresh token also failed validation with `GOOGLE_OAUTH_INVALID_GRANT`.
- Correct fix: Use `npm.cmd run google-drive:oauth:vercel` from the repo. The script opens local OAuth, verifies the issued token, writes the matching Vercel Production env vars, and deploys Production. For a non-OAuth durable setup, configure a Shared Drive/folder with `GOOGLE_DRIVE_AUTH_MODE=service-account`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`, and `GOOGLE_DRIVE_FOLDER_ID`.
- Prevention rule: Do not tell the operator only to reconnect Google Drive. Always verify whether the newly issued token is actually present in the target runtime env and whether the deployed runtime was restarted/redeployed. OAuth success pages must state that token issuance is not production env mutation.
- Verification command: Pull Vercel Production env and check presence without printing secrets; run token refresh validation before applying; after deployment, POST `/api/meta-analysis/storage-policy?googleDriveHealth=1`; run `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint`, and `npm.cmd run build` after code changes.
- Affected files: `scripts/google-drive-oauth.ts`; `src/app/api/google-drive/oauth/callback/route.ts`; `src/lib/google-drive-config.ts`; `src/lib/meta-storage-policy.ts`; `AUTH_RUNBOOK.md`.

## 2026-07-01 - VERCEL_GOOGLE_DRIVE_UNAVAILABLE_AFTER_SYNOLOGY_HEALTHY

- Error code: `VERCEL_GOOGLE_DRIVE_UNAVAILABLE_AFTER_SYNOLOGY_HEALTHY`
- Symptom: Screening page still shows `Google Drive storage is unavailable ... GOOGLE_OAUTH_INVALID_GRANT` after Synology Docker was recovered and healthy.
- Root cause: The browser is viewing a serverless/Vercel page whose full-text history backend is Google Drive. Synology Docker health only proves the NAS-local deployment is healthy; it does not repair Vercel's Google OAuth refresh token or migrate the browser session to NAS-local storage.
- Correct fix: Either reconnect Google Drive for the serverless deployment or open the Synology/NAS Docker deployment URL when the intended storage is `/volume1/docker/meta/download`.
- Prevention rule: Storage-unavailable banners must include runtime/backend context. When runtime is `serverless`, the UI must explicitly say that Synology Docker health is separate from the Vercel Google Drive backend.
- Verification command: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint`; `npm.cmd run build`; open the Screening saved-list banner and confirm it shows runtime/backends.
- Affected files: `src/lib/meta-storage-policy.ts`; `src/app/api/meta-analysis/full-text/history/route.ts`; `src/app/api/meta-analysis/extraction-dataset/route.ts`; `src/components/MetaFullTextAssistant.tsx`; `src/components/MetaExtractionDatasetPanel.tsx`; `AUTH_RUNBOOK.md`.

## 2026-06-30 - SYNOLOGY_META_ONE_MINUTE_STOP_ALARM

- Error code: `SYNOLOGY_META_ONE_MINUTE_STOP_ALARM`
- Symptom: Synology DSM repeatedly reports that `wiregene-meta` stopped unexpectedly, often at one-minute intervals and across client PCs.
- Root cause: A DSM Task Scheduler job can run the Meta start command every minute. Older startup flow used forced Docker recreation, and any repeated start/recreate or crash-loop can produce DSM container stop notifications. This is a NAS runtime/scheduler issue, not a browser-PC issue.
- Correct fix: Superseded by the Ver 2.59 image deployment standard. Keep `scripts/synology-start-meta.sh --deploy` manual or boot-time and remove all minutely deploy/Git pull jobs. Use `--verify-only` for an explicit read-only check.
- Prevention rule: Do not use `docker compose up --force-recreate` or a deploy wrapper in periodic DSM tasks. Monitoring must never perform Git pull, image deployment, NAS build, or hide a failed deploy as success.
- Verification command: `sh -n scripts/synology-deploy.sh`; `sh -n scripts/synology-start-meta.sh`; run `--verify-only`; inspect `/usr/syno/bin/synoschedtask --get` for old minutely jobs.
- Affected files: `scripts/synology-start-meta.sh`; `scripts/synology-meta-status.sh`; `scripts/synology-meta-watchdog.sh`; `SERVICE.md`; `synology/docker/meta/README.md`; `synology/docker/meta/.env.example`.

## 2026-06-30 - SYNOLOGY_META_RESTART_LOOP_EXIT_127

- Error code: `SYNOLOGY_META_RESTART_LOOP_EXIT_127`
- Symptom: Watchdog reports `running=true status=restarting exitCode=127 health=unhealthy restartCount=90` for `wiregene-meta`.
- Root cause: Docker status `restarting` with high restart count is a crash loop even when `.State.Running` is `true`. The former source-mounted runtime could also enter exit `127` when NAS-built dependencies were incomplete.
- Correct fix: Do not delete `node_modules` and rebuild on the NAS. Deploy the prebuilt production image with `--deploy`; if the new image fails health verification, use `--rollback`.
- Prevention rule: Watchdogs must classify `status=restarting` as crash-loop evidence and must not trigger a repeated build/recreate loop. Image build validation belongs in GitHub Actions.
- Verification command: run `--verify-only`; inspect `docker logs --tail 100 wiregene-meta`; confirm the deployed image ID/tag and health endpoint.
- Affected files: `scripts/synology-meta-watchdog.sh`; `scripts/synology-meta-status.sh`; `synology/docker/meta/docker-compose.yml`; `SERVICE.md`; `synology/docker/meta/README.md`.

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
