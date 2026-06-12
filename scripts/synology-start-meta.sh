#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/volume1/docker/wiregene-meta-analysis}"
RUNTIME_DIR="${META_RUNTIME_DIR:-/volume1/docker/meta}"
PACKAGE_DIR="$APP_DIR/synology/docker/meta"
LOG_DIR="${META_LOG_DIR:-$RUNTIME_DIR/logs}"
LOG_FILE="$LOG_DIR/scheduler-start.log"

log() {
  mkdir -p "$LOG_DIR"
  printf "%s %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  exit 1
}

secure_runtime_env() {
  chmod 600 "$RUNTIME_DIR/.env" 2>/dev/null || log "WARNING: Could not chmod 600 $RUNTIME_DIR/.env"
}

set_env_value() {
  key="$1"
  value="$2"
  tmp="$RUNTIME_DIR/.env.tmp.$$"
  found="false"

  [ -f "$RUNTIME_DIR/.env" ] || fail "Runtime env file does not exist: $RUNTIME_DIR/.env"

  while IFS= read -r line || [ -n "$line" ]; do
    clean_line=$(printf "%s" "$line" | sed "s/\r$//")
    case "$clean_line" in
      "$key="* | "export $key="*)
        printf "%s=%s\n" "$key" "$value" >> "$tmp"
        found="true"
        ;;
      *)
        printf "%s\n" "$clean_line" >> "$tmp"
        ;;
    esac
  done < "$RUNTIME_DIR/.env"

  if [ "$found" != "true" ]; then
    printf "%s=%s\n" "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$RUNTIME_DIR/.env"
  secure_runtime_env
}

process_env_value() {
  key="$1"
  eval "printf '%s' \"\${$key:-}\""
}

seed_runtime_env_from_process() {
  for key in APP_BASIC_AUTH_USER APP_BASIC_AUTH_PASSWORD APP_BASIC_AUTH_USERS WIREGENE_ADMIN_EMAILS APP_ADMIN_USERS APP_ADMIN_USER; do
    value=$(process_env_value "$key")
    [ -n "$value" ] || continue
    current=$(env_value "$key")
    if [ -z "$current" ]; then
      set_env_value "$key" "$value"
      log "Filled $key in $RUNTIME_DIR/.env from scheduler environment."
    fi
  done
}

ensure_runtime_env_value() {
  key="$1"
  expected="$2"
  current=$(env_value "$key")
  if [ "$current" != "$expected" ]; then
    set_env_value "$key" "$expected"
    if [ -z "$current" ]; then
      log "Set $key in $RUNTIME_DIR/.env to expected value."
    else
      log "Corrected $key in $RUNTIME_DIR/.env from '$current' to '$expected'."
    fi
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    fail "Docker Compose was not found. Install Synology Container Manager or docker-compose."
  fi
}

prepare_runtime() {
  [ -f "$APP_DIR/package.json" ] || fail "Shared app checkout was not found at APP_DIR=$APP_DIR"
  [ -d "$PACKAGE_DIR" ] || fail "Synology package directory was not found: $PACKAGE_DIR"

  mkdir -p "$RUNTIME_DIR" "$LOG_DIR" "$RUNTIME_DIR/data"
  cp "$PACKAGE_DIR/docker-compose.yml" "$RUNTIME_DIR/docker-compose.yml"
  cp "$PACKAGE_DIR/.env.example" "$RUNTIME_DIR/.env.example"
  cp "$PACKAGE_DIR/README.md" "$RUNTIME_DIR/README.md"

  if [ ! -f "$RUNTIME_DIR/.env" ]; then
    cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
    secure_runtime_env
    log "Created $RUNTIME_DIR/.env from .env.example."
  fi

  seed_runtime_env_from_process
  ensure_runtime_env_value APP_SOURCE_DIR "$APP_DIR"
  ensure_runtime_env_value CONTAINER_NAME "wiregene-meta"
  ensure_runtime_env_value WIREGENE_APP_MODE "meta"
}

env_value() {
  key="$1"
  sed -n "s/^${key}=//p" "$RUNTIME_DIR/.env" | tail -n 1 | sed "s/\r$//"
}

warn_unexpected_value() {
  key="$1"
  expected="$2"
  value=$(env_value "$key")
  if [ -n "$value" ] && [ "$value" != "$expected" ]; then
    log "WARNING: $key is '$value' in $RUNTIME_DIR/.env, expected '$expected'."
  fi
}

warn_runtime_env() {
  auth_user=$(env_value APP_BASIC_AUTH_USER)
  auth_password=$(env_value APP_BASIC_AUTH_PASSWORD)
  auth_users=$(env_value APP_BASIC_AUTH_USERS)
  admin_emails=$(env_value WIREGENE_ADMIN_EMAILS)
  admin_users=$(env_value APP_ADMIN_USERS)
  admin_user=$(env_value APP_ADMIN_USER)

  if [ -z "$auth_users" ] && { [ -z "$auth_user" ] || [ -z "$auth_password" ]; }; then
    fail "No complete Basic Auth credential found in $RUNTIME_DIR/.env. Run $APP_DIR/scripts/synology-migrate-auth-env.sh, edit $RUNTIME_DIR/.env, or rerun with APP_BASIC_AUTH_USER and APP_BASIC_AUTH_PASSWORD in the scheduler command."
  fi

  if [ -z "$admin_emails" ] && [ -z "$admin_users" ] && [ -z "$admin_user" ]; then
    log "WARNING: No admin key found in $RUNTIME_DIR/.env. Set WIREGENE_ADMIN_EMAILS or APP_ADMIN_USERS if an admin badge/permission list is required."
  fi

  warn_unexpected_value HOST_PORT "3001"
}

main() {
  log "Wiregene Meta DSM scheduler start requested."
  prepare_runtime
  warn_runtime_env
  log "Starting Wiregene Meta from $RUNTIME_DIR."
  compose -f "$RUNTIME_DIR/docker-compose.yml" --env-file "$RUNTIME_DIR/.env" up -d
  log "Wiregene Meta start requested. Check logs with: docker logs wiregene-meta"
}

main "$@"
