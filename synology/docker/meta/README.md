# Synology Meta Service

This package runs `meta.wiregene.com` as a separate Synology Docker service.

## Install / Start From DSM Task Scheduler

Use this bootstrap command when the NAS source checkout may be missing or stale.
It clones/pulls `rhhyun/wiregene-meta-analysis` first, then runs the service
start script.

```sh
/bin/sh -c 'set -eu; export PATH="/usr/local/bin:/usr/bin:/bin:/var/packages/Git/target/bin:/volume1/@appstore/Git/bin:$PATH"; SRC="/volume1/docker/wiregene-meta-analysis"; REPO="https://github.com/rhhyun/wiregene-meta-analysis.git"; command -v git >/dev/null 2>&1 || { echo "git command not found. Install Synology Git package, then rerun."; exit 1; }; mkdir -p /volume1/docker; if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only origin main; elif [ -e "$SRC" ]; then echo "$SRC exists but is not a git checkout. Move it aside or clone the repo there."; exit 1; else git clone "$REPO" "$SRC"; fi; /bin/sh "$SRC/scripts/synology-start-meta.sh"'
```

The direct command below works only after `/volume1/docker/wiregene-meta-analysis`
is already a current Git checkout.

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

On the first run, fill `/volume1/docker/meta/.env`, then run the same command
again.

If the first run stops with `No complete Basic Auth credential found`, use one
of the following.

Migrate auth values from an existing Synology search/briefing environment:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Or seed a new Basic Auth pair without editing the file manually:

```sh
APP_BASIC_AUTH_USER='YOUR_LOGIN_ID' APP_BASIC_AUTH_PASSWORD='YOUR_PASSWORD' WIREGENE_ADMIN_EMAILS='YOUR_ADMIN_EMAIL' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

The default service listens on host port `3001`.

## Required Source

The shared GitHub source should exist at:

```text
/volume1/docker/wiregene-meta-analysis
```

Change `APP_SOURCE_DIR` in `.env` if the checkout lives elsewhere.
