# 2026-07-01 Vercel Google Drive Unavailable Banner

## Trigger

Screening still displayed `Google Drive storage is unavailable ... GOOGLE_OAUTH_INVALID_GRANT` after Synology Docker was recovered and healthy.

## Diagnosis

Synology Docker health and Vercel Google Drive OAuth are separate storage layers. If the browser is on a serverless/Vercel deployment, full-text history still depends on Google Drive OAuth. A healthy NAS-local container does not repair that token.

## Change

- Added runtime-specific guidance to Google Drive unavailable warnings.
- Added storage policy summary to full-text history and extraction dataset unavailable payloads.
- Displayed runtime/backend context in the Screening full-text history banner and extraction dataset banner.

## Verification

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`
