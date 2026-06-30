# Auth Runbook

## Google Drive OAuth Invalid Grant Recovery

Use this when Screening or extraction dataset storage reports `GOOGLE_OAUTH_INVALID_GRANT`.

### What It Means

`GOOGLE_OAUTH_INVALID_GRANT` means the Google refresh token cannot be used. Common causes are token revocation, OAuth client mismatch, expired/rotated credentials, or a production environment that still has an old token. This is not repairable inside a request handler.

Opening the OAuth reconnect page is not sufficient by itself. The callback page
issues and verifies a new refresh token, but Vercel Production continues using
the old or empty environment variables until the new values are saved in Vercel
Production and Production is redeployed.

If Synology Docker is healthy but the Screening page still says Google Drive
storage is unavailable, the browser is viewing a serverless/Vercel Google Drive
storage backend, not the NAS-local storage backend. A healthy Synology container
does not repair Vercel Google OAuth. Either reconnect Google Drive for the
serverless deployment or open the Synology/NAS Docker deployment URL for
NAS-local data.

### Expected App Behavior

- Full-text history read returns `storage.unavailable=true` with reconnect and diagnostics links instead of a hard Screening crash.
- The last browser snapshot can be displayed only as read-only, clearly marked non-authoritative data.
- Full-text history writes, source attachment, AI reruns on saved sources, reviewer settings save, verification save, delete, extraction dataset save, and XLSX export remain disabled while Google Drive storage is unavailable.

### Recovery Steps

1. Prefer the one-command local repair flow:

```powershell
npm.cmd run google-drive:oauth:vercel
```

This opens a local Google OAuth URL, verifies the new refresh token, writes the
matching Google Drive values to Vercel Production, and deploys Production.

2. If using the web callback manually, open `/api/google-drive/oauth/start?diagnose=1` on the failing deployment target.
3. Complete Google authorization with the Drive account that owns or can write to the configured storage folder.
4. Copy the generated values into Vercel Production Environment Variables. Do not stop after the callback page says the token was issued.
5. Confirm the matching OAuth client values are set for the same runtime: `GOOGLE_DRIVE_AUTH_MODE=oauth`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID`, and optional `GOOGLE_DRIVE_FOLDER_ID`.
6. Redeploy Vercel or restart Synology/local Docker after changing environment variables.
7. POST `/api/meta-analysis/storage-policy?googleDriveHealth=1` and confirm Google Drive health before running Screening write actions.

### Current Failure Pattern To Check First

If `META_*_STORAGE_BACKEND=google-drive` is set but
`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and
`GOOGLE_DRIVE_REFRESH_TOKEN` are empty, reconnecting in the browser will not fix
Screening. The production runtime has no usable Google Drive credentials.

If a local `token.json` exists, validate it before copying it anywhere. An old
local token can also fail with `GOOGLE_OAUTH_INVALID_GRANT`.

### Vercel Production Checks

Use this when production still reports `GOOGLE_OAUTH_INVALID_GRANT` after a code deploy. A code redeploy alone cannot repair a revoked or mismatched Google refresh token.

```powershell
npx.cmd vercel link --yes --project wiregene-meta-analysis --scope rhhyuns-projects
npx.cmd vercel env pull .vercel-env-production.tmp --environment=production --yes --scope rhhyuns-projects
```

Then confirm these production variables are non-empty and belong to the same Google OAuth client:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID`, when configured

If `GOOGLE_DRIVE_REFRESH_TOKEN` is empty or invalid, regenerate it. If the refresh token was issued by a different OAuth client, update the client id, client secret, expected client id, and refresh token together. Do not mix a refresh token from one Google OAuth client with a different production client id/secret.

For local OAuth repair, load matching local OAuth client values first, then run:

```powershell
npm.cmd run google-drive:oauth
```

For Vercel Production, use the automated repair command instead:

```powershell
npm.cmd run google-drive:oauth:vercel
```

If OAuth already completed and `google-drive-refresh-token.local.txt` was saved
but the Vercel apply/deploy step failed, do not repeat Google consent. Apply the
saved verified token:

```powershell
npm.cmd run google-drive:oauth:vercel:apply-saved
```

The helper saves the new refresh token to `google-drive-refresh-token.local.txt`, which is gitignored. It prints only a hash prefix by default. Use `npm.cmd run google-drive:oauth -- --print-token` only when you intentionally need terminal copy/paste.

After obtaining a new token, replace production env values and redeploy production. Do not print secrets in terminal logs.

```powershell
npx.cmd vercel env rm GOOGLE_DRIVE_CLIENT_ID production --yes --scope rhhyuns-projects
npx.cmd vercel env rm GOOGLE_DRIVE_CLIENT_SECRET production --yes --scope rhhyuns-projects
npx.cmd vercel env rm GOOGLE_DRIVE_REFRESH_TOKEN production --yes --scope rhhyuns-projects
npx.cmd vercel env rm GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID production --yes --scope rhhyuns-projects

# Pipe each secret value into Vercel env add from a local secure source.
# Example shape only; do not paste real secrets into committed files.
# $clientId | npx.cmd vercel env add GOOGLE_DRIVE_CLIENT_ID production --scope rhhyuns-projects
# $clientSecret | npx.cmd vercel env add GOOGLE_DRIVE_CLIENT_SECRET production --scope rhhyuns-projects
# $refreshToken | npx.cmd vercel env add GOOGLE_DRIVE_REFRESH_TOKEN production --scope rhhyuns-projects
# $clientId | npx.cmd vercel env add GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID production --scope rhhyuns-projects

npx.cmd vercel deploy --prod --yes --scope rhhyuns-projects
```

### Service Account Option

To avoid user-refresh-token expiry/revocation entirely, use a Google service
account with a Shared Drive or a folder shared with the service account. Set:

```text
GOOGLE_DRIVE_AUTH_MODE=service-account
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...
GOOGLE_DRIVE_FOLDER_ID=...
```

When `GOOGLE_DRIVE_AUTH_MODE=service-account` is set, the app does not choose
OAuth even if old OAuth variables remain in the environment.

### Secret Handling

Local OAuth repair files such as `credentials.json`, `token.json`, `google_drive_auth.py`, and `.vercel-env-production.tmp` must remain untracked. If they appear in a local commit, remove that unpushed commit before pushing and keep the files local only.

### Verification

Run the smallest relevant local checks after code changes:

```sh
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
git diff --check
```

For deployment state, inspect the production alias:

```sh
npx.cmd vercel inspect https://meta.wiregene.com --scope rhhyuns-projects
```
