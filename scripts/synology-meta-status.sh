#!/bin/sh
# Bounded, read-only container health and HTTP 200 verification.
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

export DEPLOY_TIMEOUT_SECONDS="${META_STATUS_TIMEOUT_SECONDS:-90}"
export DEPLOY_TIMEOUT_GRACE_SECONDS="${META_STATUS_TIMEOUT_GRACE_SECONDS:-10}"
export DEPLOY_VERIFY_SECONDS="${META_STATUS_VERIFY_SECONDS:-60}"
export DEPLOY_LOG_FILE="${META_STATUS_LOG_FILE:-$RUNTIME_DIR/logs/meta-status.log}"

exec /bin/sh "$START_WRAPPER" --verify-only
