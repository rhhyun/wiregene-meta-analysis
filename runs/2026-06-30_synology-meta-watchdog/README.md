# 2026-06-30 Synology Meta Watchdog

## Trigger

Synology DSM reported repeated unexpected-stop warnings for `wiregene-meta` at roughly one-minute intervals.

## Diagnosis

- The issue is NAS-side Docker/DSM scheduling, not a client PC issue.
- `backup.md` already recorded that the start script had been changed to avoid default forced recreation.
- A DSM task that runs the deployment/start command every minute is still unsafe because it can repeatedly touch a long-running web container or hide the real crash source.

## Change

- Added `scripts/synology-meta-watchdog.sh` for one-minute DSM monitoring.
- The watchdog:
  - exits `0` by design;
  - avoids overlapping runs with `/volume1/docker/meta/.watchdog-lock`;
  - does nothing when `wiregene-meta` is already running;
  - calls `synology-start-meta.sh` only when the container is missing or stopped;
  - logs state and recent Docker logs to `/volume1/docker/meta/logs/meta-watchdog.log`.
- Documented that `synology-start-meta.sh` is for manual deployment, boot-time start, or intentional restart only.

## Immediate Synology Command

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-meta-watchdog.sh
```

## Verification

- `bash -n scripts/synology-start-meta.sh scripts/synology-meta-status.sh scripts/synology-meta-watchdog.sh`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`
