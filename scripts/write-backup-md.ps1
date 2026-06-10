param(
  [string]$AppDir = (Split-Path -Parent $PSScriptRoot),
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"

if (-not $BackupPath) {
  $BackupPath = Join-Path $AppDir "backup.md"
}

function Invoke-GitText {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GitArgs
  )

  try {
    $output = & git -C $AppDir @GitArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
      return ""
    }

    return ($output -join "`n").Trim()
  } catch {
    return ""
  }
}

function Read-CurrentVersion {
  $versionFile = Join-Path $AppDir "src/lib/version.ts"
  if (-not (Test-Path -LiteralPath $versionFile)) {
    return "unknown"
  }

  $text = Get-Content -LiteralPath $versionFile -Raw
  $match = [regex]::Match($text, 'export\s+const\s+BRIEFING_VERSION\s*=\s*"([^"]+)"')
  if ($match.Success) {
    return $match.Groups[1].Value
  }

  return "unknown"
}

function Get-FilteredStatus {
  $status = Invoke-GitText status --short
  if (-not $status) {
    return "(clean or unavailable)"
  }

  $lines = $status -split "`n" | Where-Object {
    $line = $_.TrimEnd()
    $line -and ($line -notmatch '\.env')
  }

  if (-not $lines -or $lines.Count -eq 0) {
    return "(clean after omitting env-like paths)"
  }

  return ($lines -join "`n")
}

function Get-ManualNotes {
  if (-not (Test-Path -LiteralPath $BackupPath)) {
    return "Add handoff notes here when a task has context that is not captured by git status."
  }

  $text = Get-Content -LiteralPath $BackupPath -Raw
  $match = [regex]::Match(
    $text,
    '(?s)<!-- MANUAL-NOTES-START -->\s*(.*?)\s*<!-- MANUAL-NOTES-END -->'
  )

  if ($match.Success -and $match.Groups[1].Value.Trim()) {
    return $match.Groups[1].Value.Trim()
  }

  return "Add handoff notes here when a task has context that is not captured by git status."
}

$generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
$version = Read-CurrentVersion
$branch = Invoke-GitText rev-parse --abbrev-ref HEAD
$commit = Invoke-GitText log -1 --oneline
$remote = Invoke-GitText remote get-url origin
$status = Get-FilteredStatus
$manualNotes = Get-ManualNotes

if (-not $branch) { $branch = "unknown" }
if (-not $commit) { $commit = "unknown" }
if (-not $remote) { $remote = "unknown" }

$template = @'
# Wiregene Work Backup

Generated: __GENERATED_AT__

This file is a safe handoff note for continuing the project on another PC.
Do not store passwords, tokens, API keys, cookies, or private environment
values in this file.

## Current Repository

- Repository: research-briefing-platform
- Remote: __REMOTE__
- Branch: __BRANCH__
- Latest known commit: __COMMIT__
- App version: Ver __VERSION__

## Git Status At Generation

Env-like paths are intentionally omitted from this section.

```text
__STATUS__
```

## Active Work Summary

- `search.wiregene.com` remains the research briefing/search service.
- `meta.wiregene.com` is separated for meta-analysis workflows.
- `portal.wiregene.com` is separated for account and site management.
- Synology source checkouts are separated:
  `/volume1/docker/research-briefing-platform`,
  `/volume1/docker/wiregene-meta-analysis`, and
  `/volume1/docker/wiregene-portal`.
- Synology runtime folders remain `/volume1/docker/meta` and
  `/volume1/docker/portal`.
- Existing login credentials should be migrated with
  `scripts/synology-migrate-auth-env.sh`; they should not be printed or
  manually retyped into shared notes.
- This backup file can be regenerated at the end of each work session.

## Continue On Another PC

```powershell
cd C:\Users\rhhyu\Documents\GitHub\research-briefing-platform
git pull --ff-only origin main
npm.cmd install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\write-backup-md.ps1
```

Then inspect `backup.md`, run the needed verification commands, and continue
from the latest commit.

## Synology Commands

```sh
APP_DIR=/volume1/docker/research-briefing-platform
REPO_URL=https://github.com/rhhyun/research-briefing-platform.git
if [ ! -d "$APP_DIR/.git" ]; then
  if [ -e "$APP_DIR" ]; then
    echo "ERROR: $APP_DIR exists but is not a Git checkout."
    echo "Move it aside or set APP_DIR to the real checkout path."
    exit 1
  fi
  git clone "$REPO_URL" "$APP_DIR"
fi
git -C "$APP_DIR" pull --ff-only origin main
/bin/sh "$APP_DIR/scripts/synology-write-backup-md.sh"
/bin/sh "$APP_DIR/scripts/synology-migrate-auth-env.sh"
/bin/sh "$APP_DIR/scripts/synology-bootstrap-service-repos.sh"
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
```

The Synology backup writer updates this file locally. To make the updated
handoff visible on other PCs, commit and push `backup.md` from a trusted
development machine after reviewing it.

## Important Files

- `backup.md`: latest handoff snapshot.
- `scripts/write-backup-md.ps1`: Windows backup writer.
- `scripts/synology-write-backup-md.sh`: Synology backup writer.
- `scripts/synology-bootstrap-service-repos.sh`: separated Synology source checkout bootstrapper.
- `scripts/synology-migrate-auth-env.sh`: safe auth env migration helper.
- `docs/wiregene-service-repo-split.md`: GitHub/Vercel/Synology split plan.
- `docs/synology-meta-portal-split.md`: transition NAS layout and scheduler notes.
- `src/lib/version.ts`: visible application version.

## Verification Checklist

- `npm.cmd run lint -- --max-warnings=0`
- `npx.cmd tsc --noEmit --pretty false --incremental false`
- `npm.cmd run build`
- On Synology, syntax-check shell scripts with `sh -n scripts/<name>.sh`.
- After deployment, confirm `search.wiregene.com`, `meta.wiregene.com`, and
  `portal.wiregene.com` route to the expected service surfaces.

## Manual Handoff Notes

<!-- MANUAL-NOTES-START -->
__MANUAL_NOTES__
<!-- MANUAL-NOTES-END -->
'@

$content = $template.
  Replace("__GENERATED_AT__", $generatedAt).
  Replace("__REMOTE__", $remote).
  Replace("__BRANCH__", $branch).
  Replace("__COMMIT__", $commit).
  Replace("__VERSION__", $version).
  Replace("__STATUS__", $status).
  Replace("__MANUAL_NOTES__", $manualNotes)

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($BackupPath, $content, $utf8NoBom)
Write-Host "Wrote $BackupPath"
