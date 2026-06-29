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

