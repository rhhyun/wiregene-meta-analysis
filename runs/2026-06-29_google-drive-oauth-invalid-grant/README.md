# 2026-06-29 Google Drive OAuth Invalid Grant

## Trigger

Production Screening still reported `GOOGLE_OAUTH_INVALID_GRANT` after the UI/storage-guard deployment.

## Findings

- Production alias `https://meta.wiregene.com` was reachable.
- Recent Vercel logs showed storage-related API failures, including `GET /api/meta-analysis/projects` returning `500` and full-text history detail returning `503`.
- Pulling production env to `.vercel-env-production.tmp` showed Google Drive storage backends enabled.
- The local OAuth repair files were present but untracked after removing an unsafe local unpushed commit.
- Local `token.json` refresh failed with Google `invalid_grant`, consistent with a revoked or expired refresh token.
- A local OAuth consent server was started, but no Google callback was received before timeout. No new token was issued.

## Root Cause

The remaining production failure is an OAuth credential problem, not a code regression. Google is rejecting refresh-token exchange. Drive access will remain unavailable until a new refresh token is issued and deployed with the matching OAuth client id and secret.

## Actions Taken

- Removed the unpushed local commit that contained OAuth repair files while preserving the files locally.
- Added local OAuth repair files to `.gitignore`.
- Hardened `scripts/google-drive-oauth.ts` so it no longer prints refresh tokens by default and uses the same Drive scope as the production OAuth route.
- Updated `AUTH_RUNBOOK.md` with Vercel production checks and env replacement steps.
- Updated `ERROR_LEDGER.md` with the operational rule that `GOOGLE_OAUTH_INVALID_GRANT` requires credential rotation.

## Blocked Step

Google account consent is required to issue a new refresh token. Once the browser authorization completes, update Vercel production env and redeploy.

## Verification

- `npx.cmd vercel logs meta.wiregene.com --scope rhhyuns-projects --since 2h`
- Local OAuth process was stopped after no callback.
