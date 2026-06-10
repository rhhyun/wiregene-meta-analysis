# Research Briefing Operations

## Wiregene Split Operations

- `meta/`: transition boundary for exporting `meta.wiregene.com`.
- `portal/`: transition boundary for exporting `portal.wiregene.com`.
- `synology/docker/meta`: Synology Docker package for the meta service.
- `synology/docker/portal`: Synology Docker package for the portal service.

See `docs/wiregene-service-repo-split.md` for the target GitHub/Vercel/Synology
separation. See `docs/synology-meta-portal-split.md` for transition NAS folder
layout, compose commands, and DSM Task Scheduler commands.

## GitHub Actions Failure Triage

The scheduled briefing workflow uses first-party GitHub actions and then runs:

```bash
npm run briefing:generate
```

If GitHub shows a Node.js 20 actions deprecation warning, treat it separately from `process completed with exit code 1`. The warning is about the JavaScript runtime used by workflow actions. The workflow pins `actions/checkout@v6` and `actions/setup-node@v6`, which run on the newer action runtime while installing Node.js 24 for the project command.

The most likely `exit code 1` cause is missing or invalid scheduled-run configuration before the briefing runner can write to Google Drive. Required GitHub Actions configuration is:

```text
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REFRESH_TOKEN
NCBI_EMAIL
```

For a personal Google Drive, use OAuth credentials. Generate the refresh token
locally with:

```bash
npm run google-drive:oauth
```

`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` must be the full contents of the downloaded
Google Cloud service-account key `.json` file, but service-account auth is only
appropriate for Shared Drive or Workspace domain setups. It is not the Drive
folder id, Drive URL, service-account email, private key alone, or a local file
path.
For GitHub Actions, the most reliable value is the base64-encoded file contents.
In PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

`GOOGLE_DRIVE_FOLDER_ID` or `GOOGLE_DRIVE_DATABASE_FILE_ID` is optional with
OAuth. With service-account auth, one of them is required because service
accounts cannot upload to their own Drive root.

The workflow validates required values before running the generator so setup
problems fail with an explicit message. If validation passes and the job still
fails, inspect the `Generate and store briefing` logs for Google OAuth, Drive
permission, PubMed, or summarization errors.
