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
  for key in APP_BASIC_AUTH_USER APP_BASIC_AUTH_PASSWORD APP_BASIC_AUTH_USERS WIREGENE_ADMIN_EMAILS APP_ADMIN_USERS APP_ADMIN_USER PORTAL_AUTH_CHECK_SECRET PORTAL_AUTH_CHECK_URL WIREGENE_AUTH_CHECK_SECRET OPENAI_API_KEY OPENAI_MODEL META_ALLOW_GOOGLE_DRIVE_STORAGE META_PROJECT_STORAGE_BACKEND META_PROJECT_STORAGE_ROOT META_PROJECT_DRIVE_PREFIX META_USER_PROJECTS_STORAGE_BACKEND META_USER_PROJECTS_FILE META_USER_PROJECTS_DRIVE_FILENAME META_USER_PROJECTS_DRIVE_FILE_ID META_AI_SETTINGS_STORAGE_BACKEND META_AI_SETTINGS_STORAGE_PATH META_AI_SETTINGS_DRIVE_FILENAME META_AI_SETTINGS_DRIVE_FILE_ID META_AI_SETTINGS_SECRET META_FULL_TEXT_HISTORY_STORAGE_BACKEND META_FULL_TEXT_HISTORY_STORAGE_PATH META_FULL_TEXT_HISTORY_DRIVE_FILENAME META_FULL_TEXT_HISTORY_DRIVE_FILE_ID META_FULL_TEXT_SOURCE_STORAGE_BACKEND META_FULL_TEXT_SOURCE_STORAGE_PATH REPORT_STORAGE_BACKEND REPORT_STORAGE_LOCAL_PATH GOOGLE_DRIVE_CLIENT_ID GOOGLE_DRIVE_CLIENT_SECRET GOOGLE_DRIVE_REFRESH_TOKEN GOOGLE_DRIVE_FOLDER_ID GOOGLE_DRIVE_FOLDER_URL GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON; do
    value=$(process_env_value "$key")
    [ -n "$value" ] || continue
    current=$(env_value "$key")
    if [ -z "$current" ]; then
      set_env_value "$key" "$value"
      log "Filled $key in $RUNTIME_DIR/.env from scheduler environment."
    fi
  done

  for key in HOST_PORT; do
    value=$(process_env_value "$key")
    [ -n "$value" ] || continue
    current=$(env_value "$key")
    if [ "$current" != "$value" ]; then
      set_env_value "$key" "$value"
      log "Set $key in $RUNTIME_DIR/.env from scheduler environment."
    fi
  done
}

seed_portal_auth_from_known_runtime_env() {
  current=$(env_value PORTAL_AUTH_CHECK_SECRET)
  fallback=$(env_value WIREGENE_AUTH_CHECK_SECRET)
  [ -z "$current" ] || return 0
  [ -z "$fallback" ] || return 0

  for candidate in \
    /volume1/docker/portal/.env \
    /volume1/docker/wiregene-portal/.env \
    /volume1/docker/research-briefing/.env \
    /volume1/docker/search/.env \
    /volume1/docker/hyunlab/.env \
    /volume1/docker/wiregene/.env
  do
    [ -f "$candidate" ] || continue
    value=$(
      sed -n \
        -e 's/^PORTAL_AUTH_CHECK_SECRET=//p' \
        -e 's/^WIREGENE_AUTH_CHECK_SECRET=//p' \
        "$candidate" |
        sed 's/\r$//' |
        sed -n '1p'
    )
    [ -n "$value" ] || continue
    set_env_value PORTAL_AUTH_CHECK_SECRET "$value"
    log "Filled PORTAL_AUTH_CHECK_SECRET in $RUNTIME_DIR/.env from $candidate."
    return 0
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

  mkdir -p "$RUNTIME_DIR" "$LOG_DIR" "$RUNTIME_DIR/data" "$RUNTIME_DIR/download" "$RUNTIME_DIR/download/_system"
  cp "$PACKAGE_DIR/docker-compose.yml" "$RUNTIME_DIR/docker-compose.yml"
  cp "$PACKAGE_DIR/.env.example" "$RUNTIME_DIR/.env.example"
  cp "$PACKAGE_DIR/README.md" "$RUNTIME_DIR/README.md"

  if [ ! -f "$RUNTIME_DIR/.env" ]; then
    cp "$RUNTIME_DIR/.env.example" "$RUNTIME_DIR/.env"
    secure_runtime_env
    log "Created $RUNTIME_DIR/.env from .env.example."
  fi

  seed_runtime_env_from_process
  seed_portal_auth_from_known_runtime_env
  ensure_runtime_env_value APP_SOURCE_DIR "$APP_DIR"
  ensure_runtime_env_value CONTAINER_NAME "wiregene-meta"
  ensure_runtime_env_value WIREGENE_APP_MODE "meta"
  ensure_runtime_env_value META_ALLOW_GOOGLE_DRIVE_STORAGE "false"
  ensure_runtime_env_value REPORT_STORAGE_BACKEND "local-json"
  ensure_runtime_env_value REPORT_STORAGE_LOCAL_PATH "download/_system/research-briefing-storage.json"
  ensure_runtime_env_value META_PROJECT_STORAGE_BACKEND "local-json"
  ensure_runtime_env_value META_PROJECT_STORAGE_ROOT "download"
  ensure_runtime_env_value META_USER_PROJECTS_STORAGE_BACKEND "local-json"
  ensure_runtime_env_value META_USER_PROJECTS_FILE "download/_system/user-study-projects.json"
  ensure_runtime_env_value META_AI_SETTINGS_STORAGE_BACKEND "local-json"
  ensure_runtime_env_value META_AI_SETTINGS_STORAGE_PATH "download/_system/meta-ai-settings.json"
  ensure_runtime_env_value META_FULL_TEXT_HISTORY_STORAGE_BACKEND "local-json"
  ensure_runtime_env_value META_FULL_TEXT_HISTORY_STORAGE_PATH "download/_system/meta-full-text-history.json"
  ensure_runtime_env_value META_FULL_TEXT_SOURCE_STORAGE_BACKEND "local-file"
  ensure_runtime_env_value META_FULL_TEXT_SOURCE_STORAGE_PATH "download/_system/full-text-files"
  migrate_legacy_meta_data_to_download
}

migrate_file_if_missing() {
  source_path="$1"
  target_path="$2"
  label="$3"
  [ -f "$source_path" ] || return 0
  [ ! -e "$target_path" ] || return 0
  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
  log "Copied legacy $label to $target_path."
}

migrate_dir_if_missing() {
  source_path="$1"
  target_path="$2"
  label="$3"
  [ -d "$source_path" ] || return 0
  [ ! -e "$target_path" ] || return 0
  mkdir -p "$(dirname "$target_path")"
  cp -R "$source_path" "$target_path"
  log "Copied legacy $label to $target_path."
}

migrate_legacy_meta_data_to_download() {
  mkdir -p "$RUNTIME_DIR/download/_system"

  migrate_file_if_missing "$RUNTIME_DIR/data/research-briefing-storage.json" "$RUNTIME_DIR/download/_system/research-briefing-storage.json" "report storage"
  migrate_file_if_missing "$RUNTIME_DIR/data/user-study-projects.json" "$RUNTIME_DIR/download/_system/user-study-projects.json" "study project registry"
  migrate_file_if_missing "$RUNTIME_DIR/data/meta-ai-settings.json" "$RUNTIME_DIR/download/_system/meta-ai-settings.json" "AI settings"
  migrate_file_if_missing "$RUNTIME_DIR/data/meta-full-text-history.json" "$RUNTIME_DIR/download/_system/meta-full-text-history.json" "legacy full-text history"
  migrate_dir_if_missing "$RUNTIME_DIR/data/full-text-files" "$RUNTIME_DIR/download/_system/full-text-files" "legacy full-text source files"

  if [ -d "$RUNTIME_DIR/data/projects" ]; then
    for project_dir in "$RUNTIME_DIR"/data/projects/*; do
      [ -e "$project_dir" ] || continue
      [ -d "$project_dir" ] || continue
      project_name=$(basename "$project_dir")
      migrate_dir_if_missing "$project_dir" "$RUNTIME_DIR/download/$project_name" "project folder $project_name"
    done
  fi
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
  portal_auth_secret=$(env_value PORTAL_AUTH_CHECK_SECRET)
  wiregene_auth_secret=$(env_value WIREGENE_AUTH_CHECK_SECRET)
  admin_emails=$(env_value WIREGENE_ADMIN_EMAILS)
  admin_users=$(env_value APP_ADMIN_USERS)
  admin_user=$(env_value APP_ADMIN_USER)

  if [ -z "$auth_users" ] && { [ -z "$auth_user" ] || [ -z "$auth_password" ]; } && { [ -n "$portal_auth_secret" ] || [ -n "$wiregene_auth_secret" ]; }; then
    log "Local Basic Auth is not configured; Meta will rely on portal auth check secret."
  fi

  if [ -z "$auth_users" ] && { [ -z "$auth_user" ] || [ -z "$auth_password" ]; } && [ -z "$portal_auth_secret" ] && [ -z "$wiregene_auth_secret" ]; then
    log "WARNING: No local Basic Auth or portal auth secret is configured in $RUNTIME_DIR/.env. The container will still start so the site can be reached, but configure PORTAL_AUTH_CHECK_SECRET or APP_BASIC_AUTH_USER/APP_BASIC_AUTH_PASSWORD before exposing this service publicly."
  fi

  if [ -z "$admin_emails" ] && [ -z "$admin_users" ] && [ -z "$admin_user" ]; then
    log "WARNING: No admin key found in $RUNTIME_DIR/.env. Set WIREGENE_ADMIN_EMAILS or APP_ADMIN_USERS if an admin badge/permission list is required."
  fi

  openai_api_key=$(env_value OPENAI_API_KEY)
  if [ -z "$openai_api_key" ]; then
    log "WARNING: OPENAI_API_KEY is empty in $RUNTIME_DIR/.env. Full-text article judgment will use fallback rules instead of OpenAI AI extraction."
  fi

  warn_unexpected_value HOST_PORT "3001"
}

cleanup_failed_meta_container() {
  container_name=$(env_value CONTAINER_NAME)
  [ -n "$container_name" ] || container_name="wiregene-meta"

  command -v docker >/dev/null 2>&1 || return 0
  if docker ps --format '{{.Names}}' | grep -x "$container_name" >/dev/null 2>&1; then
    return 0
  fi
  if docker ps -a --format '{{.Names}}' | grep -x "$container_name" >/dev/null 2>&1; then
    log "Removing non-running stale container: $container_name"
    docker rm "$container_name" >/dev/null 2>&1 || fail "Could not remove stale container: $container_name"
  fi
}

check_host_port_available() {
  host_port=$(env_value HOST_PORT)
  [ -n "$host_port" ] || host_port="3001"
  container_name=$(env_value CONTAINER_NAME)
  [ -n "$container_name" ] || container_name="wiregene-meta"

  command -v docker >/dev/null 2>&1 || return 0

  port_owners=$(
    docker ps --format '{{.ID}}	{{.Names}}	{{.Ports}}' |
      awk -v port="$host_port" 'index($0, ":" port "->") > 0 { print }'
  )
  [ -n "$port_owners" ] || return 0

  other_owners=$(printf "%s\n" "$port_owners" | awk -v name="$container_name" '$2 != name { print }')
  [ -n "$other_owners" ] || return 0

  log "HOST_PORT=$host_port is already used by another running container:"
  printf "%s\n" "$other_owners" | while IFS= read -r owner; do
    log "PORT_OWNER: $owner"
  done

  if [ "${META_STOP_PORT_OWNER:-false}" = "true" ]; then
    owner_ids=$(printf "%s\n" "$other_owners" | awk '{ print $1 }')
    log "META_STOP_PORT_OWNER=true; stopping container(s) using HOST_PORT=$host_port."
    docker stop $owner_ids >/dev/null
    return 0
  fi

  fail "HOST_PORT=$host_port is already allocated. Stop the listed container in Synology Container Manager, set HOST_PORT to a free port in $RUNTIME_DIR/.env, or rerun with META_STOP_PORT_OWNER=true if this old container should be replaced."
}

main() {
  log "Wiregene Meta DSM scheduler start requested."
  prepare_runtime
  warn_runtime_env
  cleanup_failed_meta_container
  check_host_port_available
  log "Starting Wiregene Meta from $RUNTIME_DIR."
  compose -f "$RUNTIME_DIR/docker-compose.yml" --env-file "$RUNTIME_DIR/.env" up -d --force-recreate
  log "Wiregene Meta start requested. Check logs with: docker logs wiregene-meta"
}

main "$@"
