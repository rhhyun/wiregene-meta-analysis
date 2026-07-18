#!/bin/sh
# Meta site wrapper for the common bounded Synology deployment engine.
set -eu

SAFE_PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/var/packages/Git/target/bin:/volume1/@appstore/Git/bin"
PATH="$SAFE_PATH:${PATH:-}"
export PATH

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
RUNTIME_DIR="${META_RUNTIME_DIR:-/volume1/docker/meta}"
PACKAGE_DIR="$APP_DIR/synology/docker/meta"
ENGINE="$APP_DIR/scripts/synology-deploy.sh"
SITE_CONFIG="$PACKAGE_DIR/deploy.env"
PREPARE_MARKER="$RUNTIME_DIR/.prepare-ok"
RUNNER_DIR="$RUNTIME_DIR/.deploy-runner"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

env_value() {
  key="$1"
  [ -f "$RUNTIME_DIR/.env" ] || return 0
  sed -n "s/^${key}=//p" "$RUNTIME_DIR/.env" | tail -n 1 | sed 's/\r$//'
}

set_env_value() {
  key="$1"
  value="$2"
  env_file="$RUNTIME_DIR/.env"
  tmp="$RUNTIME_DIR/.env.tmp.$$"
  found=false
  : > "$tmp"
  while IFS= read -r line || [ -n "$line" ]; do
    clean=$(printf '%s' "$line" | sed 's/\r$//')
    case "$clean" in
      "$key="*|"export $key="*)
        printf '%s=%s\n' "$key" "$value" >> "$tmp"
        found=true
        ;;
      *) printf '%s\n' "$clean" >> "$tmp" ;;
    esac
  done < "$env_file"
  [ "$found" = true ] || printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$env_file"
  chmod 600 "$env_file" 2>/dev/null || true
}

ensure_env_value() {
  key="$1"
  value="$2"
  [ "$(env_value "$key")" = "$value" ] || set_env_value "$key" "$value"
}

ensure_env_default() {
  key="$1"
  value="$2"
  [ -n "$(env_value "$key")" ] || set_env_value "$key" "$value"
}

seed_process_env_if_missing() {
  for key in \
    APP_BASIC_AUTH_USER APP_BASIC_AUTH_PASSWORD APP_BASIC_AUTH_USERS \
    WIREGENE_ADMIN_EMAILS APP_ADMIN_USERS APP_ADMIN_USER \
    PORTAL_AUTH_CHECK_SECRET PORTAL_AUTH_CHECK_URL WIREGENE_AUTH_CHECK_SECRET \
    OPENAI_API_KEY OPENAI_MODEL META_AI_SETTINGS_SECRET \
    GOOGLE_DRIVE_CLIENT_ID GOOGLE_DRIVE_CLIENT_SECRET GOOGLE_DRIVE_REFRESH_TOKEN \
    GOOGLE_DRIVE_FOLDER_ID GOOGLE_DRIVE_FOLDER_URL GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  do
    value=$(printenv "$key" 2>/dev/null || true)
    [ -n "$value" ] || continue
    [ -n "$(env_value "$key")" ] || set_env_value "$key" "$value"
  done
}

seed_portal_auth_if_missing() {
  [ -z "$(env_value PORTAL_AUTH_CHECK_SECRET)" ] || return 0
  [ -z "$(env_value WIREGENE_AUTH_CHECK_SECRET)" ] || return 0

  for candidate in \
    /volume1/docker/portal/.env \
    /volume1/docker/wiregene-portal/.env \
    /volume1/docker/research-briefing/.env \
    /volume1/docker/search/.env \
    /volume1/docker/hyunlab/.env \
    /volume1/docker/wiregene/.env
  do
    [ -f "$candidate" ] || continue
    value=$(sed -n \
      -e 's/^PORTAL_AUTH_CHECK_SECRET=//p' \
      -e 's/^WIREGENE_AUTH_CHECK_SECRET=//p' \
      "$candidate" | sed 's/\r$//' | sed -n '1p')
    [ -n "$value" ] || continue
    set_env_value PORTAL_AUTH_CHECK_SECRET "$value"
    echo "Preserved existing Portal authentication from $candidate."
    return 0
  done
}

warn_if_auth_is_missing() {
  [ -n "$(env_value APP_BASIC_AUTH_USERS)" ] && return 0
  if [ -n "$(env_value APP_BASIC_AUTH_USER)" ] && [ -n "$(env_value APP_BASIC_AUTH_PASSWORD)" ]; then
    return 0
  fi
  [ -n "$(env_value PORTAL_AUTH_CHECK_SECRET)" ] && return 0
  [ -n "$(env_value WIREGENE_AUTH_CHECK_SECRET)" ] && return 0
  echo "WARNING: No local Basic Auth or Portal auth secret is configured in $RUNTIME_DIR/.env." >&2
}

copy_file_if_missing() {
  source_path="$1"
  target_path="$2"
  [ -f "$source_path" ] || return 0
  [ ! -e "$target_path" ] || return 0
  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
}

copy_dir_if_missing() {
  source_path="$1"
  target_path="$2"
  [ -d "$source_path" ] || return 0
  [ ! -e "$target_path" ] || return 0
  mkdir -p "$(dirname "$target_path")"
  cp -R "$source_path" "$target_path"
}

migrate_legacy_storage() {
  copy_file_if_missing "$RUNTIME_DIR/data/research-briefing-storage.json" "$RUNTIME_DIR/download/_system/research-briefing-storage.json"
  copy_file_if_missing "$RUNTIME_DIR/data/user-study-projects.json" "$RUNTIME_DIR/download/_system/user-study-projects.json"
  copy_file_if_missing "$RUNTIME_DIR/data/meta-ai-settings.json" "$RUNTIME_DIR/download/_system/meta-ai-settings.json"
  copy_file_if_missing "$RUNTIME_DIR/data/meta-full-text-history.json" "$RUNTIME_DIR/download/_system/meta-full-text-history.json"
  copy_dir_if_missing "$RUNTIME_DIR/data/full-text-files" "$RUNTIME_DIR/download/_system/full-text-files"
  if [ -d "$RUNTIME_DIR/data/projects" ]; then
    for project_dir in "$RUNTIME_DIR"/data/projects/*; do
      [ -d "$project_dir" ] || continue
      copy_dir_if_missing "$project_dir" "$RUNTIME_DIR/download/$(basename "$project_dir")"
    done
  fi
}

prepare_meta() {
  rm -f "$PREPARE_MARKER"
  [ -f "$APP_DIR/package.json" ] || fail "Meta checkout missing package.json: $APP_DIR"
  [ -f "$PACKAGE_DIR/docker-compose.yml" ] || fail "Compose template missing: $PACKAGE_DIR/docker-compose.yml"
  [ -f "$PACKAGE_DIR/.env.example" ] || fail "Runtime env template missing: $PACKAGE_DIR/.env.example"
  [ -f "$SITE_CONFIG" ] || fail "Deploy site config missing: $SITE_CONFIG"

  mkdir -p "$RUNTIME_DIR" "$RUNTIME_DIR/data" "$RUNTIME_DIR/download/_system" "$RUNTIME_DIR/logs"
  cp "$PACKAGE_DIR/docker-compose.yml" "$RUNTIME_DIR/docker-compose.yml"
  cp "$PACKAGE_DIR/.env.example" "$RUNTIME_DIR/.env.example"
  cp "$SITE_CONFIG" "$RUNTIME_DIR/deploy.env"
  [ -f "$RUNTIME_DIR/.env" ] || cp "$PACKAGE_DIR/.env.example" "$RUNTIME_DIR/.env"
  chmod 600 "$RUNTIME_DIR/.env" 2>/dev/null || true

  seed_process_env_if_missing
  seed_portal_auth_if_missing
  ensure_env_default META_IMAGE "${META_IMAGE:-ghcr.io/rhhyun/wiregene-meta-analysis:main}"
  ensure_env_default HOST_PORT "${HOST_PORT:-3001}"
  ensure_env_value CONTAINER_NAME wiregene-meta
  ensure_env_value APP_BASE_URL https://meta.wiregene.com
  ensure_env_value WIREGENE_APP_MODE meta
  ensure_env_value META_ALLOW_GOOGLE_DRIVE_STORAGE false
  ensure_env_value REPORT_STORAGE_BACKEND local-json
  ensure_env_value REPORT_STORAGE_LOCAL_PATH download/_system/research-briefing-storage.json
  ensure_env_value META_PROJECT_STORAGE_BACKEND local-json
  ensure_env_value META_PROJECT_STORAGE_ROOT download
  ensure_env_value META_USER_PROJECTS_STORAGE_BACKEND local-json
  ensure_env_value META_USER_PROJECTS_FILE download/_system/user-study-projects.json
  ensure_env_value META_AI_SETTINGS_STORAGE_BACKEND local-json
  ensure_env_value META_AI_SETTINGS_STORAGE_PATH download/_system/meta-ai-settings.json
  ensure_env_value META_FULL_TEXT_HISTORY_STORAGE_BACKEND local-json
  ensure_env_value META_FULL_TEXT_HISTORY_STORAGE_PATH download/_system/meta-full-text-history.json
  ensure_env_value META_FULL_TEXT_SOURCE_STORAGE_BACKEND local-file
  ensure_env_value META_FULL_TEXT_SOURCE_STORAGE_PATH download/_system/full-text-files
  ensure_env_value META_REQUIRE_HEALTHY true
  migrate_legacy_storage
  warn_if_auth_is_missing

  printf '%s\n' "prepared_at=$(date +%s)" > "$PREPARE_MARKER"
  echo "Meta runtime prepared without building or removing containers."
}

if [ "${1:-}" = --prepare ]; then
  prepare_meta
  exit 0
fi

action="${1:---deploy}"
case "$action" in
  --deploy|--rollback|--verify-only|--check-only) ;;
  *) echo "Usage: $0 [--deploy|--rollback|--verify-only]" >&2; exit 64 ;;
esac

[ -f "$ENGINE" ] || fail "Common deploy engine missing: $ENGINE"
mkdir -p "$RUNNER_DIR" || fail "Could not create deploy runner directory: $RUNNER_DIR"
ENGINE_RUNNER="$RUNNER_DIR/synology-deploy-$$.sh"
ENGINE_RUNNER_TMP="$ENGINE_RUNNER.tmp"
cp "$ENGINE" "$ENGINE_RUNNER_TMP" || fail "Could not snapshot the deploy engine."
chmod 700 "$ENGINE_RUNNER_TMP" 2>/dev/null || true
if ! mv "$ENGINE_RUNNER_TMP" "$ENGINE_RUNNER"; then
  rm -f "$ENGINE_RUNNER_TMP" 2>/dev/null || true
  fail "Could not publish the deploy engine snapshot."
fi
export DEPLOY_SITE_CONFIG="$SITE_CONFIG"
export DEPLOY_PREPARE_HOOK="$0"
export DEPLOY_SELF_SNAPSHOT="$ENGINE_RUNNER"
export DEPLOY_APP_DIR="$APP_DIR"
export DEPLOY_RUNTIME_DIR="$RUNTIME_DIR"
export DEPLOY_COMPOSE_FILE="$RUNTIME_DIR/docker-compose.yml"
export DEPLOY_ENV_FILE="$RUNTIME_DIR/.env"

case "$action" in
  --deploy|--rollback|--verify-only) exec /bin/sh "$ENGINE_RUNNER" "$action" ;;
  --check-only) exec /bin/sh "$ENGINE_RUNNER" --verify-only ;;
esac
