# 2026-06-30 Synology Restart Loop Exit 127

## Trigger

Watchdog log reported:

```text
CONTAINER_STATE: running=true status=restarting exitCode=127 oomKilled=false health=unhealthy restartCount=90
```

## Diagnosis

- `status=restarting` plus high `restartCount` is a Docker crash loop.
- `exitCode=127` usually means a command is missing inside the container.
- In the Synology Meta compose command, a common cause is a stale mounted `node_modules` folder where `node_modules/.bin/next` is missing.

## Changes

- Watchdog now treats `status=restarting` as crash-loop evidence and logs Docker tail before recovery.
- Watchdog treats high restart count plus unhealthy state as crash-loop evidence.
- Status diagnostic now prints restart-loop and exit-127 hints.
- Synology compose startup now reinstalls dependencies when `node_modules/.bin/next` is missing.

## Immediate Synology Recovery

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && META_FORCE_RECREATE=true /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

If exit 127 persists:

```sh
rm -rf /volume1/docker/wiregene-meta-analysis/node_modules && git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && META_FORCE_RECREATE=true /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## Verification

- `bash -n scripts/synology-start-meta.sh scripts/synology-meta-status.sh scripts/synology-meta-watchdog.sh`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`
