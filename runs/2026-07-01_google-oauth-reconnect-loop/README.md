# Google OAuth Reconnect Loop

Date: 2026-07-01

## Problem

The user had reconnected Google Drive OAuth several times, but Screening still
reported Google Drive unavailable / `GOOGLE_OAUTH_INVALID_GRANT`.

## Findings

- Vercel Production env pull succeeded.
- Secret-safe inspection showed Meta storage backends set to `google-drive`.
- The same inspection showed the production Google Drive OAuth credential
  variables were empty:
  - `GOOGLE_DRIVE_CLIENT_ID`
  - `GOOGLE_DRIVE_CLIENT_SECRET`
  - `GOOGLE_DRIVE_REFRESH_TOKEN`
  - `GOOGLE_DRIVE_FOLDER_ID` / `GOOGLE_DRIVE_FOLDER_URL`
- Local `token.json` existed but failed refresh-token validation with
  `GOOGLE_OAUTH_INVALID_GRANT`.

## Root Cause

OAuth reconnect/token issuance and Vercel Production environment update were
separate steps. The callback could verify a newly issued token, but the running
Production deployment would continue using old, empty, or mismatched env vars
until the new values were saved and Production redeployed.

## Fix Implemented

- Added `npm.cmd run google-drive:oauth:vercel`.
- The command runs OAuth locally, verifies the new token, writes matching
  Vercel Production env vars, and deploys Production.
- Added `GOOGLE_DRIVE_AUTH_MODE=oauth|service-account` so service-account
  storage can be forced when configured.
- Updated the OAuth callback success page so it no longer implies Production
  was changed by the browser reconnect alone.

## Verification To Run After Operator Consent

```powershell
npm.cmd run google-drive:oauth:vercel
```

Then open Screening and run storage diagnostics, or POST:

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST -Uri "https://meta.wiregene.com/api/meta-analysis/storage-policy?googleDriveHealth=1"
```

## Deployment

The code fix was deployed to Vercel Production:

- Deployment id: `dpl_BJdrw8GkZrBP8Xoz1RzHMYMfcSYh`
- Production URL: `https://wiregene-meta-analysis-6jio9ezdu-rhhyuns-projects.vercel.app`
- Alias: `https://meta.wiregene.com`

This deployment does not restore Google Drive access by itself because the
Production Google Drive credential variables were empty at inspection time.
