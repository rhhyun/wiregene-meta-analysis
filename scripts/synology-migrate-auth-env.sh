#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/volume1/docker/research-briefing-platform}"
META_ENV="${META_ENV:-/volume1/docker/meta/.env}"
PORTAL_ENV="${PORTAL_ENV:-/volume1/docker/portal/.env}"
META_EXAMPLE="$APP_DIR/synology/docker/meta/.env.example"
PORTAL_EXAMPLE="$APP_DIR/synology/docker/portal/.env.example"

AUTH_KEYS="APP_BASIC_AUTH_USER APP_BASIC_AUTH_PASSWORD APP_BASIC_AUTH_USERS WIREGENE_ADMIN_EMAILS APP_ADMIN_USERS APP_ADMIN_USER"
BACKUP_SUFFIX=$(date '+%Y%m%d%H%M%S')
DEFAULT_SOURCE_FILES="
$APP_DIR/.env.local
$APP_DIR/.env
$APP_DIR/.env.production
/volume1/docker/search/.env
/volume1/docker/research-briefing/.env
"
DEFAULT_SOURCE_CONTAINERS="research-briefing-web wiregene-search"

log() {
  printf "%s %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

ensure_target_env() {
  target="$1"
  example="$2"

  if [ -f "$target" ]; then
    return 0
  fi

  [ -f "$example" ] || fail "Missing example env file: $example"
  mkdir -p "$(dirname "$target")"
  cp "$example" "$target"
  secure_target_env "$target"
  log "Created target env file: $target"
}

backup_target_env() {
  target="$1"
  [ -f "$target" ] || return 0
  cp -p "$target" "$target.bak.$BACKUP_SUFFIX"
  log "Backed up target env file: $target.bak.$BACKUP_SUFFIX"
}

secure_target_env() {
  target="$1"
  chmod 600 "$target" 2>/dev/null || log "WARNING: Could not chmod 600 $target"
}

read_env_file_value() {
  file="$1"
  key="$2"

  [ -f "$file" ] || return 0
  sed -n \
    -e "s/^${key}=//p" \
    -e "s/^export[[:space:]]\\{1,\\}${key}=//p" \
    "$file" | tail -n 1 | sed "s/\r$//"
}

read_container_env_value() {
  container="$1"
  key="$2"

  command -v docker >/dev/null 2>&1 || return 0
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" 2>/dev/null |
    sed -n "s/^${key}=//p" | tail -n 1 | sed "s/\r$//"
}

target_value() {
  file="$1"
  key="$2"
  read_env_file_value "$file" "$key"
}

set_env_value() {
  file="$1"
  key="$2"
  value="$3"
  tmp="${file}.tmp.$$"
  found="false"

  [ -f "$file" ] || fail "Target env file does not exist: $file"

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
  done < "$file"

  if [ "$found" != "true" ]; then
    printf "%s=%s\n" "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$file"
  secure_target_env "$file"
}

find_source_value() {
  key="$1"

  if [ -n "${AUTH_SOURCE_ENV:-}" ]; then
    value=$(read_env_file_value "$AUTH_SOURCE_ENV" "$key")
    if [ -n "$value" ]; then
      printf "%s\n" "$value"
      return 0
    fi
  fi

  for file in $DEFAULT_SOURCE_FILES; do
    value=$(read_env_file_value "$file" "$key")
    if [ -n "$value" ]; then
      printf "%s\n" "$value"
      return 0
    fi
  done

  for container in $DEFAULT_SOURCE_CONTAINERS; do
    value=$(read_container_env_value "$container" "$key")
    if [ -n "$value" ]; then
      printf "%s\n" "$value"
      return 0
    fi
  done
}

copy_key_if_missing() {
  target="$1"
  key="$2"
  current=$(target_value "$target" "$key")

  if [ -n "$current" ]; then
    log "Keeping existing $key in $target"
    return 0
  fi

  value=$(find_source_value "$key")
  if [ -z "$value" ]; then
    log "No existing value found for $key"
    return 0
  fi

  set_env_value "$target" "$key" "$value"
  log "Filled $key in $target from existing environment"
}

fallback_admin_from_user() {
  if [ "${AUTH_FALLBACK_ADMIN_FROM_USER:-false}" != "true" ]; then
    return 0
  fi

  target="$1"
  admin_value=$(target_value "$target" "WIREGENE_ADMIN_EMAILS")
  if [ -n "$admin_value" ]; then
    return 0
  fi

  auth_user=$(target_value "$target" "APP_BASIC_AUTH_USER")
  if [ -z "$auth_user" ]; then
    return 0
  fi

  set_env_value "$target" "WIREGENE_ADMIN_EMAILS" "$auth_user"
  log "Filled WIREGENE_ADMIN_EMAILS in $target from APP_BASIC_AUTH_USER"
}

audit_target_env() {
  target="$1"
  auth_user=$(target_value "$target" "APP_BASIC_AUTH_USER")
  auth_password=$(target_value "$target" "APP_BASIC_AUTH_PASSWORD")
  auth_users=$(target_value "$target" "APP_BASIC_AUTH_USERS")
  admin_emails=$(target_value "$target" "WIREGENE_ADMIN_EMAILS")
  admin_users=$(target_value "$target" "APP_ADMIN_USERS")
  admin_user=$(target_value "$target" "APP_ADMIN_USER")

  if [ -n "$auth_users" ] || { [ -n "$auth_user" ] && [ -n "$auth_password" ]; }; then
    log "Auth readiness for $target: SET"
  else
    log "Auth readiness for $target: MISSING"
  fi

  if [ -n "$admin_emails" ] || [ -n "$admin_users" ] || [ -n "$admin_user" ]; then
    log "Admin key readiness for $target: SET"
  else
    log "Admin key readiness for $target: MISSING"
  fi
}

main() {
  [ -d "$APP_DIR" ] || fail "APP_DIR not found: $APP_DIR"

  ensure_target_env "$META_ENV" "$META_EXAMPLE"
  ensure_target_env "$PORTAL_ENV" "$PORTAL_EXAMPLE"
  backup_target_env "$META_ENV"
  backup_target_env "$PORTAL_ENV"

  for target in "$META_ENV" "$PORTAL_ENV"; do
    for key in $AUTH_KEYS; do
      copy_key_if_missing "$target" "$key"
    done
    fallback_admin_from_user "$target"
    audit_target_env "$target"
  done

  log "Auth migration finished without printing secret values."
  log "If no admin key was found, set WIREGENE_ADMIN_EMAILS manually or rerun with AUTH_FALLBACK_ADMIN_FROM_USER=true."
  log "Next: /bin/sh $APP_DIR/scripts/synology-bootstrap-service-repos.sh"
  log "Next: /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh"
  log "Next: /bin/sh /volume1/docker/wiregene-portal/scripts/synology-start-portal.sh"
}

main "$@"
