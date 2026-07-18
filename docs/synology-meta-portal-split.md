# Synology Meta and Portal Split

> **Current deployment notice (Ver 2.59):** this file records the historical
> service split. Its combined Meta/Portal/briefing scheduler examples are
> deprecated and must not be registered in DSM. Meta's active standard is
> [`DEPLOYMENT.md`](../DEPLOYMENT.md) and uses only
> `synology-start-meta.sh --deploy|--rollback|--verify-only`.

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

The source checkout and runtime directory remain separate. Use the repository's
normal GitHub-to-Synology sync process to install/update the wrapper, then keep
the DSM deploy command limited to:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Rollback and read-only verification:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

On the first run, fill `/volume1/docker/meta/.env`, then run the same command
again.

If existing auth values must be migrated, run the helper once before deploy:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Do not place credentials in a shared scheduler command. Set auth, admin, and
OpenAI values in `/volume1/docker/meta/.env`.

```text
APP_BASIC_AUTH_USER=YOUR_LOGIN_ID
APP_BASIC_AUTH_PASSWORD=YOUR_PASSWORD
WIREGENE_ADMIN_EMAILS=YOUR_ADMIN_EMAIL
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5-nano
```

For accurate AI-assisted full-text screening/extraction, configure OpenAI. With
OpenAI enabled, the full-text assistant also returns a Hyunlab-style quality
review with score, grade, improvement guidance, and criteria-level checks.

If `OPENAI_API_KEY` is not set, the full-text assistant still extracts text but
uses fallback rules only and records a low quality-review score requiring human
verification.

Meta administrators can alternatively use the in-app **AI 평가 설정** menu to
save the OpenAI key/model. The key is encrypted in
`META_AI_SETTINGS_STORAGE_PATH` and takes priority over `OPENAI_API_KEY`.
Set `META_AI_SETTINGS_SECRET` in `/volume1/docker/meta/.env` to keep the
encrypted key readable even if Basic Auth credentials are rotated.

Default host port:

```text
3001
```

Reverse proxy:

```text
meta.wiregene.com -> NAS_IP:3001
```

## Portal Service

ID/PW addition, deletion, and password reset/change are performed only through
`portal.wiregene.com`. Meta and other research services use Portal
authentication and should not provide separate writable account-management
screens.

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

Meta, Portal, and research briefing are independent services. Never combine
their start/generate commands in one DSM task. The only active Meta task is
manual or boot-time:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Meta rollback and read-only verification are separate explicit modes:

```text
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

Portal and briefing must follow their own repository's deploy standard, lock,
timeout, health, and logging policy. Historical commands below this notice must
not be copied into an active Meta scheduler.

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
