# GitHub Actions + Google Drive Migration Plan

This migration changes the scheduled briefing runner from Vercel Cron + Turso to GitHub Actions + Google Drive.

## Target Architecture

- GitHub Actions owns the Monday/Thursday 05:00 KST schedule.
- The scheduled job runs `npm run briefing:generate`.
- `src/lib/report-generator.ts` gathers PubMed/news items and creates a report payload.
- `src/lib/storage.ts` provides a JSON storage adapter with local-file and Google Drive backends.
- `src/lib/google-drive-storage.ts` reads/writes the JSON database file in the configured Drive folder.
- Existing libSQL/Turso code remains available behind the storage backend switch.

## Why This Shape

- GitHub Actions can run the whole briefing program without deploying a cron endpoint.
- Google Drive becomes the durable data store, not just an export target.
- Keeping the existing libSQL path intact lets other agents keep working on the dashboard while the scheduled job moves first.
- A single JSON database keeps topics, reports, items, and report-item ordering together for simple dashboard reads.

## Required GitHub Actions Configuration

Set these in the repository under `Settings > Secrets and variables > Actions`.

```text
GOOGLE_DRIVE_CLIENT_ID=OAuth client id for personal Google Drive
GOOGLE_DRIVE_CLIENT_SECRET=OAuth client secret for personal Google Drive
GOOGLE_DRIVE_REFRESH_TOKEN=OAuth refresh token for personal Google Drive
GOOGLE_DRIVE_FOLDER_ID=Drive folder id that will hold report JSON files
GOOGLE_DRIVE_FOLDER_URL=optional full Drive folder URL instead of the raw folder id
GOOGLE_DRIVE_FOLDER_NAME=Research Briefing Platform
GOOGLE_DRIVE_DATABASE_FILE_ID=optional existing Drive file id for the JSON database
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=service-account JSON for Shared Drive/domain setups only
GOOGLE_DRIVE_DATABASE_FILENAME=research-briefing-database.json
NCBI_EMAIL=your-email@example.com
NCBI_TOOL=research-briefing-platform
NCBI_API_KEY=optional PubMed API key
OPENAI_API_KEY=optional
OPENAI_MODEL=gpt-5-nano
BRIEFING_DAYS_BACK=7
```

The Google service account needs write access to the target Drive folder. Share the folder with the service account `client_email`.

Use repository secrets for sensitive values:

- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
- `NCBI_API_KEY` when used
- `OPENAI_API_KEY` when OpenAI summaries are enabled

These values are non-sensitive and can be set as either repository secrets or
repository variables:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_DRIVE_FOLDER_URL`
- `GOOGLE_DRIVE_FOLDER_NAME`
- `GOOGLE_DRIVE_DATABASE_FILE_ID` when reusing an existing database file
- `NCBI_EMAIL`
- `OPENAI_MODEL`
- `BRIEFING_DAYS_BACK`

### Recommended: personal Google Drive OAuth

For a personal Google Drive, use OAuth refresh-token credentials. Service
accounts cannot upload to their own Drive root because they do not have storage
quota.

1. In Google Cloud Console, enable Google Drive API.
2. Create an OAuth client for a Desktop app.
3. Set local environment variables `GOOGLE_DRIVE_CLIENT_ID` and
   `GOOGLE_DRIVE_CLIENT_SECRET`.
4. Run:

```bash
npm run google-drive:oauth
```

5. Open the printed URL, sign in with the Google account that owns the Drive,
   approve the Drive access, then copy the printed refresh token into the
   GitHub secret `GOOGLE_DRIVE_REFRESH_TOKEN`.
6. Add `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET` to GitHub
   Actions secrets or variables as appropriate.

`GOOGLE_DRIVE_FOLDER_ID` is optional with OAuth. If omitted, the workflow
creates or reuses a folder named `Research Briefing Platform` in the authorized
user's Drive and saves `research-briefing-database.json` there. The workflow
logs the Drive folder and file IDs, adds Drive links to the GitHub run summary,
and uploads a GitHub Actions artifact named `research-briefing-database` as a
backup mirror.

### Alternative: service account for Shared Drive/domain setups

For GitHub Actions, prefer storing `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` as the
base64-encoded contents of the service-account key file. In PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

Raw JSON also works, but base64 avoids copy/paste encoding damage. If raw JSON
is pasted, keep the whole JSON object as the secret value.

The secret value is the full contents of the downloaded Google Cloud
service-account key `.json` file. It should look like a JSON object that starts
with `{` and contains these fields:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "name@project-id.iam.gserviceaccount.com"
}
```

Do not use the Drive folder id, Drive folder URL, service-account email, private
key alone, or a local file path as `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`. If the
GitHub log mentions `U+FFFD replacement characters`, delete and recreate the
secret from the original `.json` key file, preferably with the base64 command
above.

With service-account authentication, `GOOGLE_DRIVE_FOLDER_ID` or
`GOOGLE_DRIVE_DATABASE_FILE_ID` is required. The target should be a Shared Drive
or domain setup where the service account can create files. A service account
alone cannot write to a personal Drive root.

## Workflow Draft

Create `.github/workflows/research-briefing.yml` when the repository-level workflow area is available:

```yaml
name: Research briefing

on:
  workflow_dispatch:
  schedule:
    # Monday/Thursday 05:00 KST = Sunday/Wednesday 20:00 UTC
    - cron: "0 20 * * 0,3"

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run briefing:generate
        env:
          GOOGLE_DRIVE_FOLDER_ID: ${{ secrets.GOOGLE_DRIVE_FOLDER_ID }}
          GOOGLE_DRIVE_FOLDER_URL: ${{ secrets.GOOGLE_DRIVE_FOLDER_URL }}
          GOOGLE_DRIVE_FOLDER_NAME: Research Briefing Platform
          GOOGLE_DRIVE_CLIENT_ID: ${{ secrets.GOOGLE_DRIVE_CLIENT_ID }}
          GOOGLE_DRIVE_CLIENT_SECRET: ${{ secrets.GOOGLE_DRIVE_CLIENT_SECRET }}
          GOOGLE_DRIVE_REFRESH_TOKEN: ${{ secrets.GOOGLE_DRIVE_REFRESH_TOKEN }}
          GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON }}
          GOOGLE_DRIVE_DATABASE_FILENAME: research-briefing-database.json
          NCBI_EMAIL: ${{ secrets.NCBI_EMAIL }}
          NCBI_TOOL: ${{ secrets.NCBI_TOOL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_MODEL: ${{ vars.OPENAI_MODEL || 'gpt-5-nano' }}
          BRIEFING_DAYS_BACK: ${{ vars.BRIEFING_DAYS_BACK || '7' }}
```

The checked-in workflow currently runs project commands on Node 24 and sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` so GitHub JavaScript actions prefer the newer runtime.

## Troubleshooting Actions Runs

### Exit code 1

`Process completed with exit code 1` is the final status from a failed command, not the root cause. Open the failed run, expand `Generate and store briefing`, and read the first error above that annotation.

For this workflow, setup failures usually come from one of these configuration gaps:

- `GOOGLE_DRIVE_FOLDER_ID` points to a folder the service account cannot access.
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` is missing, malformed, or copied with broken JSON/base64 content.
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` contains the folder id, service-account email, private key alone, or file path instead of the full key JSON.
- A service account is configured without a Shared Drive folder/file target.
- The Drive folder has not been shared with the service account `client_email`.
- Personal Drive OAuth secrets are missing or incomplete.
- `NCBI_EMAIL` is missing.
- `OPENAI_API_KEY` is missing while OpenAI summaries are expected.
- `GOOGLE_DRIVE_DATABASE_FILE_ID` points to a deleted file or a file outside the shared folder.

After updating secrets or variables, rerun the workflow with `workflow_dispatch`. Secrets are only available to new runs; editing them does not repair an already-failed run.

If the validation step still says a configuration value is missing after you
added it, check these points before rerunning:

- The value was added in the same repository shown in the run log, not another fork or local clone.
- The name is exactly the one shown in the log; GitHub secret and variable names are case-sensitive.
- The value is under repository `Secrets` or repository `Variables`, not only under an `Environment`.
- The workflow was started with `Actions > Research Briefing > Run workflow`, not by rerunning an older failed job.

### Node.js 20 actions deprecation warning

The Node.js 20 actions deprecation warning is separate from `exit code 1`. Treat it as an Actions runtime warning unless the log also shows a concrete failure in `Checkout`, `Setup Node`, `Install dependencies`, or `Generate and store briefing`.

This project workflow already uses:

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

steps:
  - uses: actions/setup-node@v4
    with:
      node-version: "24"
```

If the warning still appears, first confirm the run is using the latest workflow from the branch being executed. Then check whether a third-party action in the log still reports Node 20 internally. That warning does not by itself mean the briefing command failed; the actionable failure is the first error that appears before `Process completed with exit code 1`.

## Data Layout In Drive

The scheduled runner writes one JSON database file:

```text
research-briefing-database.json
```

Database shape:

```json
{
  "topics": [],
  "reports": [
    {
      "id": "uuid",
      "title": "Research Briefing 2026-05-01 - 2026-05-07",
      "generatedAt": "2026-05-07T20:00:00.000Z",
      "periodStart": "2026-04-30",
      "periodEnd": "2026-05-07",
      "itemIds": []
    }
  ],
  "items": [],
  "reportItems": {}
}
```

## Follow-Up Work

- Decide whether Zotero sync remains an on-demand web action or becomes part of the GitHub scheduled run.
- Remove Vercel Cron and Turso environment variables after the Drive-backed path is validated in production.
