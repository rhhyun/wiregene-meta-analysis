#!/bin/sh
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=${APP_DIR:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}
BACKUP_PATH=${BACKUP_PATH:-"$APP_DIR/backup.md"}
TMP_PATH="$BACKUP_PATH.tmp.$$"

git_text() {
  if command -v git >/dev/null 2>&1; then
    git -C "$APP_DIR" "$@" 2>/dev/null || true
  fi
}

read_version() {
  version_file="$APP_DIR/src/lib/version.ts"
  if [ -f "$version_file" ]; then
    sed -n 's/^export const BRIEFING_VERSION[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$version_file" | sed -n '1p'
  fi
}

read_manual_notes() {
  if [ -f "$BACKUP_PATH" ]; then
    awk '
      /<!-- MANUAL-NOTES-START -->/ {flag=1; next}
      /<!-- MANUAL-NOTES-END -->/ {flag=0}
      flag {print}
    ' "$BACKUP_PATH"
  fi
}

generated_at=$(date '+%Y-%m-%d %H:%M:%S %z')
version=$(read_version)
branch=$(git_text rev-parse --abbrev-ref HEAD | sed -n '1p')
commit=$(git_text log -1 --oneline | sed -n '1p')
remote=$(git_text remote get-url origin | sed -n '1p')
status=$(git_text status --short | grep -v '[.]env' || true)
manual_notes=$(read_manual_notes)

[ -n "$version" ] || version="unknown"
[ -n "$branch" ] || branch="unknown"
[ -n "$commit" ] || commit="unknown"
[ -n "$remote" ] || remote="unknown"
[ -n "$status" ] || status="(clean after omitting env-like paths)"
[ -n "$manual_notes" ] || manual_notes="Add handoff notes here when a task has context that is not captured by git status."

cat > "$TMP_PATH" <<EOF
# Wiregene Work Backup

Generated: $generated_at

This file is a safe handoff note for continuing the project on another PC.
Do not store passwords, tokens, API keys, cookies, or private environment
values in this file.

## Current Repository

- Repository: research-briefing-platform
- Remote: $remote
- Branch: $branch
- Latest known commit: $commit
- App version: Ver $version

## Git Status At Generation

Env-like paths are intentionally omitted from this section.

\`\`\`text
$status
\`\`\`

## Active Work Summary

- \`search.wiregene.com\` remains the research briefing/search service.
- \`meta.wiregene.com\` is separated for meta-analysis workflows.
- \`portal.wiregene.com\` is separated for account and site management.
- Synology source checkouts are separated:
  \`/volume1/docker/research-briefing-platform\`,
  \`/volume1/docker/wiregene-meta-analysis\`, and
  \`/volume1/docker/wiregene-portal\`.
- Synology runtime folders remain \`/volume1/docker/meta\` and
  \`/volume1/docker/portal\`.
- Existing login credentials should be migrated with
  \`scripts/synology-migrate-auth-env.sh\`; they should not be printed or
  manually retyped into shared notes.
- This backup file can be regenerated at the end of each work session.

## Continue On Another PC

\`\`\`powershell
cd C:\\Users\\rhhyu\\Documents\\GitHub\\research-briefing-platform
git pull --ff-only origin main
npm.cmd install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\write-backup-md.ps1
\`\`\`

Then inspect \`backup.md\`, run the needed verification commands, and continue
from the latest commit.

## Synology Commands

\`\`\`sh
APP_DIR=/volume1/docker/research-briefing-platform
REPO_URL=https://github.com/rhhyun/research-briefing-platform.git
if [ ! -d "\$APP_DIR/.git" ]; then
  if [ -e "\$APP_DIR" ]; then
    echo "ERROR: \$APP_DIR exists but is not a Git checkout."
    echo "Move it aside or set APP_DIR to the real checkout path."
    exit 1
  fi
  git clone "\$REPO_URL" "\$APP_DIR"
fi
git -C "\$APP_DIR" pull --ff-only origin main
/bin/sh "\$APP_DIR/scripts/synology-write-backup-md.sh"
/bin/sh "\$APP_DIR/scripts/synology-migrate-auth-env.sh"
/bin/sh "\$APP_DIR/scripts/synology-bootstrap-service-repos.sh"
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
\`\`\`

The Synology backup writer updates this file locally. To make the updated
handoff visible on other PCs, commit and push \`backup.md\` from a trusted
development machine after reviewing it.

## Important Files

- \`backup.md\`: latest handoff snapshot.
- \`scripts/write-backup-md.ps1\`: Windows backup writer.
- \`scripts/synology-write-backup-md.sh\`: Synology backup writer.
- \`scripts/synology-bootstrap-service-repos.sh\`: separated Synology source checkout bootstrapper.
- \`scripts/synology-migrate-auth-env.sh\`: safe auth env migration helper.
- \`docs/wiregene-service-repo-split.md\`: GitHub/Vercel/Synology split plan.
- \`docs/synology-meta-portal-split.md\`: transition NAS layout and scheduler notes.
- \`src/lib/version.ts\`: visible application version.

## Verification Checklist

- \`npm.cmd run lint -- --max-warnings=0\`
- \`npx.cmd tsc --noEmit --pretty false --incremental false\`
- \`npm.cmd run build\`
- On Synology, syntax-check shell scripts with \`sh -n scripts/<name>.sh\`.
- After deployment, confirm \`search.wiregene.com\`, \`meta.wiregene.com\`, and
  \`portal.wiregene.com\` route to the expected service surfaces.

## Manual Handoff Notes

<!-- MANUAL-NOTES-START -->
$manual_notes
<!-- MANUAL-NOTES-END -->
EOF

mv "$TMP_PATH" "$BACKUP_PATH"
echo "Wrote $BACKUP_PATH"
