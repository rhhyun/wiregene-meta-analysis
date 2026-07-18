#!/bin/sh
# Bounded, read-only watchdog. It never pulls, starts, recreates, or removes containers.
set -u

SAFE_PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin"
PATH="$SAFE_PATH:${PATH:-}"
export PATH

APP_DIR="${APP_DIR:-/volume1/docker/wiregene-meta-analysis}"
RUNTIME_DIR="${META_RUNTIME_DIR:-/volume1/docker/meta}"
START_WRAPPER="$APP_DIR/scripts/synology-start-meta.sh"

if [ ! -f "$START_WRAPPER" ]; then
  echo "ERROR: Meta status wrapper is missing: $START_WRAPPER" >&2
  exit 1
fi

# A minutely DSM monitor must finish before the next minute even on failure.
export DEPLOY_TIMEOUT_SECONDS="${META_WATCHDOG_TIMEOUT_SECONDS:-45}"
export DEPLOY_TIMEOUT_GRACE_SECONDS="${META_WATCHDOG_TIMEOUT_GRACE_SECONDS:-5}"
export DEPLOY_VERIFY_SECONDS="${META_WATCHDOG_VERIFY_SECONDS:-20}"
export DEPLOY_LOG_FILE="${META_WATCHDOG_LOG_FILE:-$RUNTIME_DIR/logs/meta-watchdog.log}"

exec /bin/sh "$START_WRAPPER" --verify-only
