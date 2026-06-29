# Error Ledger

## 2026-06-29 - GOOGLE_OAUTH_INVALID_GRANT

- Error code: `GOOGLE_OAUTH_INVALID_GRANT`
- Symptom: Screening full-text history or Included-paper Excel dataset failed with `Google Drive OAuth is unavailable`, blocking reads from `google-drive:meta-projects__...`.
- Root cause: The deployed Google Drive refresh token is invalid, expired, revoked, or mismatched with the OAuth client/env currently used by the app. Application code cannot make an invalid refresh token valid again.
- Correct fix: Reconnect Google Drive through `/api/google-drive/oauth/start?diagnose=1`, update the production `GOOGLE_DRIVE_REFRESH_TOKEN` and matching Google Drive OAuth env vars when required, then redeploy/restart the target runtime.
- Prevention rule: Recoverable Google Drive/OAuth read failures must render a guarded `storage.unavailable` state, never a destructive empty shared dataset. Browser cache may be shown only as a read-only last snapshot. All write actions that could modify full-text history, source files, AI reruns, reviewer settings, verification, deletes, or extraction exports must remain blocked until shared storage reconnects. If a nested API payload still contains Google Drive OAuth diagnostics, the UI must replace raw `operation/path/backend/message/help` details with the controlled reconnect message.
- Verification command: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint`; `npm.cmd run build`; `git diff --check`.
- Affected files: `src/app/api/meta-analysis/full-text/history/route.ts`; `src/app/api/meta-analysis/extraction-dataset/route.ts`; `src/components/MetaFullTextAssistant.tsx`; `src/components/MetaExtractionDatasetPanel.tsx`; `AUTH_RUNBOOK.md`.
