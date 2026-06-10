# Synology Meta and Portal Split

This repository now keeps two operating boundaries for Wiregene:

```text
meta/                  GitHub-side boundary for meta.wiregene.com
portal/                GitHub-side boundary for portal.wiregene.com
synology/docker/meta   Synology Docker package for the meta service
synology/docker/portal Synology Docker package for the portal service
```

During the transition the application source can still be exported from this
repository, but the operating target is separate source checkouts for each
service. The split is controlled by `WIREGENE_APP_MODE` in Docker or by the
request host on Vercel.

## Recommended NAS Layout

```text
/volume1/docker/research-briefing-platform  search.wiregene.com source checkout
/volume1/docker/wiregene-meta-analysis      meta.wiregene.com source checkout
/volume1/docker/wiregene-portal             portal.wiregene.com source checkout
/volume1/docker/meta                        meta service compose/env/data/logs
/volume1/docker/portal                      portal service compose/env/data/logs
```

See `docs/wiregene-service-repo-split.md` for the full GitHub/Vercel/Synology
repository split.

## Meta Service

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

On the first run, fill `/volume1/docker/meta/.env`, then run the same command
again.

Default host port:

```text
3001
```

Reverse proxy:

```text
meta.wiregene.com -> NAS_IP:3001
```

## Portal Service

```sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
```

On the first run, fill `/volume1/docker/portal/.env`, then run the same command
again.

Default host port:

```text
3002
```

Reverse proxy:

```text
portal.wiregene.com -> NAS_IP:3002
```

## Scheduler

No new recurring Synology scheduler is required for `meta` or `portal`; they
are web services. Keep the existing research briefing scheduled task if it is
already registered:

```text
/bin/sh /volume1/docker/research-briefing-platform/scripts/synology-briefing-generate.sh
```

If Synology is used as the primary runtime instead of Vercel, add boot-time
tasks for the two Docker services. The combined DSM Task Scheduler command is:

```text
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
```

Separate DSM Task Scheduler commands are also available:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
```

On the first run, each script creates `/volume1/docker/meta/.env` or
`/volume1/docker/portal/.env` from the package example and exits. Fill the
auth/admin values in the generated `.env` files, then run the scheduler task
again.

If the existing login ID/password values are already stored in the old
Synology environment and are not known to the operator, do not print or retype
the password. Run the migration helper instead:

```sh
/bin/sh /volume1/docker/research-briefing-platform/scripts/synology-migrate-auth-env.sh
/bin/sh /volume1/docker/research-briefing-platform/scripts/synology-bootstrap-service-repos.sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh
```

The helper fills only missing auth/admin keys in `/volume1/docker/meta/.env`
and `/volume1/docker/portal/.env`. Existing non-empty values are kept, and
secret values are not printed to the terminal. Before writing, the helper
creates timestamped `.bak.YYYYMMDDHHMMSS` backups and applies `chmod 600` when
the filesystem permits it. It reports only `SET` or `MISSING` readiness.

If no existing `WIREGENE_ADMIN_EMAILS`, `APP_ADMIN_USERS`, or `APP_ADMIN_USER`
value exists and the primary Basic Auth user should become the portal admin,
rerun the helper explicitly with:

```sh
AUTH_FALLBACK_ADMIN_FROM_USER=true /bin/sh /volume1/docker/research-briefing-platform/scripts/synology-migrate-auth-env.sh
```

## Work Backup Handoff

Use `backup.md` to continue the same work from another PC. It records only safe
handoff information such as branch, latest known commit, app version, scheduler
commands, and manual notes. It must not contain passwords, tokens, API keys, or
private `.env` values.

Manual Synology update:

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
```

If the combined meta/portal start task should refresh the local handoff note
only after a successful start, DSM Task Scheduler can use:

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
/bin/sh "$APP_DIR/scripts/synology-bootstrap-service-repos.sh" &&
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh &&
/bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh &&
/bin/sh "$APP_DIR/scripts/synology-write-backup-md.sh"
```

Do not auto-commit or auto-push `backup.md` from Synology. Review and commit the
file from a trusted development machine so other PCs can pull a clean handoff.

## Important Notes

- `meta` allows only `/`, `/api/auth/logout`, and `/api/meta-analysis/*`.
- `portal` allows only `/`, `/api/auth/logout`, and `/api/admin/*`.
- Users listed in `WIREGENE_ADMIN_EMAILS` are displayed as `관리자` after Basic
  Auth login and receive all portal site permissions.
- Portal-created admin accounts receive all registered site permissions. Runtime
  Basic Auth still reads `APP_BASIC_AUTH_*` values.
- On a shared Vercel project, leave `WIREGENE_APP_MODE` empty so host detection
  can split `search`, `meta`, and `portal` automatically.
