# Auth Runbook

## Google Drive OAuth Invalid Grant Recovery

Use this when Screening or extraction dataset storage reports `GOOGLE_OAUTH_INVALID_GRANT`.

### What It Means

`GOOGLE_OAUTH_INVALID_GRANT` means the Google refresh token cannot be used. Common causes are token revocation, OAuth client mismatch, expired/rotated credentials, or a production environment that still has an old token. This is not repairable inside a request handler.

### Expected App Behavior

- Full-text history read returns `storage.unavailable=true` with reconnect and diagnostics links instead of a hard Screening crash.
- The last browser snapshot can be displayed only as read-only, clearly marked non-authoritative data.
- Full-text history writes, source attachment, AI reruns on saved sources, reviewer settings save, verification save, delete, extraction dataset save, and XLSX export remain disabled while Google Drive storage is unavailable.

### Recovery Steps

1. Open `/api/google-drive/oauth/start?diagnose=1` on the same deployment target that is failing.
2. Complete Google authorization with the Drive account that owns or can write to the configured storage folder.
3. Save the regenerated refresh token into the target runtime environment as `GOOGLE_DRIVE_REFRESH_TOKEN`.
4. Confirm the matching OAuth client values are set for the same runtime: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and `GOOGLE_DRIVE_FOLDER_ID`.
5. Redeploy Vercel or restart Synology/local Docker after changing environment variables.
6. Open `/api/meta-analysis/storage-policy?googleDriveHealth=1` and confirm Google Drive health before running Screening write actions.

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
