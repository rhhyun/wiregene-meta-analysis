#!/bin/sh
# Common, bounded Synology deployment engine.
# Site wrappers provide only paths, image, port, health, and env boundaries.
set -u

SAFE_PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/var/packages/Git/target/bin:/volume1/@appstore/ContainerManager/usr/bin:/volume1/@appstore/Docker/usr/bin:/volume1/@appstore/Git/bin"
PATH="$SAFE_PATH:${PATH:-}"
export PATH

case "$0" in
  /*) SELF="$0" ;;
  *) SELF=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0") ;;
esac

SITE_CONFIG="${DEPLOY_SITE_CONFIG:-}"
PREPARE_HOOK="${DEPLOY_PREPARE_HOOK:-}"
SELF_SNAPSHOT="${DEPLOY_SELF_SNAPSHOT:-}"
case "$SELF_SNAPSHOT" in
  ""|/*) ;;
  *)
    snapshot_dir=$(CDPATH='' cd -- "$(dirname -- "$SELF_SNAPSHOT")" 2>/dev/null && pwd || true)
    if [ -n "$snapshot_dir" ]; then
      SELF_SNAPSHOT="$snapshot_dir/$(basename -- "$SELF_SNAPSHOT")"
    else
      SELF_SNAPSHOT=""
    fi
    ;;
esac
DEPLOY_PHASE="initial"
ROLLBACK_READY="false"
ROLLBACK_IN_PROGRESS="false"
SOURCE_SHA=""
PROBE_CONTAINER=""
LEGACY_ROLLBACK="false"
LEGACY_COMPOSE_BACKUP=""
LEGACY_COMPOSE_OVERRIDE=""
VERIFY_MODE="normal"

usage() {
  echo "Usage: $0 [--deploy|--rollback|--verify-only]" >&2
}

is_uint() {
  case "${1:-}" in ""|*[!0-9]*) return 1 ;; *) return 0 ;; esac
}

resolve_binary() {
  binary_name="$1"
  shift
  resolved=$(command -v "$binary_name" 2>/dev/null || true)
  if [ -n "$resolved" ]; then
    printf '%s\n' "$resolved"
    return 0
  fi
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

load_site_config() {
  if [ -z "$SITE_CONFIG" ]; then
    echo "ERROR: DEPLOY_SITE_CONFIG is required." >&2
    return 1
  fi
  if [ ! -f "$SITE_CONFIG" ]; then
    echo "ERROR: Site config not found: $SITE_CONFIG" >&2
    return 1
  fi
  # shellcheck disable=SC1090
  . "$SITE_CONFIG"

  : "${DEPLOY_SITE_NAME:?DEPLOY_SITE_NAME is required}"
  : "${DEPLOY_SERVICE:?DEPLOY_SERVICE is required}"
  : "${DEPLOY_APP_DIR:?DEPLOY_APP_DIR is required}"
  : "${DEPLOY_RUNTIME_DIR:?DEPLOY_RUNTIME_DIR is required}"
  : "${DEPLOY_COMPOSE_FILE:?DEPLOY_COMPOSE_FILE is required}"
  : "${DEPLOY_ENV_FILE:?DEPLOY_ENV_FILE is required}"
  : "${DEPLOY_CONTAINER_NAME:?DEPLOY_CONTAINER_NAME is required}"
  : "${DEPLOY_IMAGE_ENV_KEY:?DEPLOY_IMAGE_ENV_KEY is required}"
  : "${DEPLOY_IMAGE_REPOSITORY:?DEPLOY_IMAGE_REPOSITORY is required}"
  : "${DEPLOY_IMAGE:?DEPLOY_IMAGE is required}"
  : "${DEPLOY_ROLLBACK_IMAGE:?DEPLOY_ROLLBACK_IMAGE is required}"
  : "${DEPLOY_HEALTH_PATH:?DEPLOY_HEALTH_PATH is required}"

  is_uint "${DEPLOY_TIMEOUT_SECONDS:-}" || DEPLOY_TIMEOUT_SECONDS=600
  is_uint "${DEPLOY_TIMEOUT_GRACE_SECONDS:-}" || DEPLOY_TIMEOUT_GRACE_SECONDS=20
  is_uint "${DEPLOY_VERIFY_SECONDS:-}" || DEPLOY_VERIFY_SECONDS=180
  is_uint "${DEPLOY_LOG_MAX_BYTES:-}" || DEPLOY_LOG_MAX_BYTES=10485760
  is_uint "${DEPLOY_LOG_FILES:-}" || DEPLOY_LOG_FILES=3
  [ "$DEPLOY_LOG_FILES" -ge 1 ] || DEPLOY_LOG_FILES=3
  is_uint "${DEPLOY_HOST_PORT:-}" || DEPLOY_HOST_PORT=3001

  LOCK_DIR="${DEPLOY_LOCK_DIR:-$DEPLOY_RUNTIME_DIR/.deploy-lock}"
  LOG_DIR="${DEPLOY_LOG_DIR:-$DEPLOY_RUNTIME_DIR/logs}"
  LOG_FILE="${DEPLOY_LOG_FILE:-$LOG_DIR/deploy.log}"
}

terminate_tree() {
  target_pid="$1"
  signal_name="$2"
  if command -v pkill >/dev/null 2>&1; then
    pkill -"$signal_name" -P "$target_pid" 2>/dev/null || true
  fi
  kill -"$signal_name" "$target_pid" 2>/dev/null || true
}

run_timeout_fallback() {
  action="$1"
  marker="$DEPLOY_RUNTIME_DIR/.deploy-timeout.$$"
  rm -f "$marker"
  /bin/sh "$SELF" --worker "$action" &
  child_pid=$!
  (
    sleep "$DEPLOY_TIMEOUT_SECONDS"
    if kill -0 "$child_pid" 2>/dev/null; then
      printf '%s\n' "timeout" > "$marker"
      terminate_tree "$child_pid" TERM
      sleep "$DEPLOY_TIMEOUT_GRACE_SECONDS"
      terminate_tree "$child_pid" KILL
    fi
  ) &
  timer_pid=$!

  wait "$child_pid"
  child_status=$?
  kill "$timer_pid" 2>/dev/null || true
  wait "$timer_pid" 2>/dev/null || true
  if [ -f "$marker" ]; then
    rm -f "$marker"
    echo "ERROR: $DEPLOY_SITE_NAME deployment exceeded ${DEPLOY_TIMEOUT_SECONDS}s." >&2
    return 124
  fi
  rm -f "$marker"
  return "$child_status"
}

cleanup_lock_after_hard_timeout() {
  [ -d "$LOCK_DIR" ] || return 0
  timed_out_pid=$(sed -n '1p' "$LOCK_DIR/pid" 2>/dev/null || true)
  if is_uint "$timed_out_pid" && kill -0 "$timed_out_pid" 2>/dev/null; then
    echo "ERROR: Timed-out worker pid $timed_out_pid is still alive; lock was not stolen." >&2
    return 1
  fi
  rm -f "$LOCK_DIR/pid" "$LOCK_DIR/started_at" 2>/dev/null || true
  if ! rmdir "$LOCK_DIR" 2>/dev/null; then
    echo "ERROR: Timed-out lock contains unexpected files and was not removed: $LOCK_DIR" >&2
    return 1
  fi
}

run_supervised() {
  action="$1"
  mkdir -p "$DEPLOY_RUNTIME_DIR" || return 1
  timeout_bin=$(resolve_binary timeout /usr/bin/timeout /bin/timeout 2>/dev/null || true)
  if [ -n "$timeout_bin" ]; then
    if "$timeout_bin" --help 2>&1 | grep -q -- '-k'; then
      "$timeout_bin" -k "$DEPLOY_TIMEOUT_GRACE_SECONDS" "$DEPLOY_TIMEOUT_SECONDS" /bin/sh "$SELF" --worker "$action"
    else
      echo "WARNING: timeout utility has no -k support; worker TERM handler and simple timeout are active." >&2
      "$timeout_bin" "$DEPLOY_TIMEOUT_SECONDS" /bin/sh "$SELF" --worker "$action"
    fi
    status=$?
    case "$status" in
      124|137)
        echo "ERROR: $DEPLOY_SITE_NAME deployment exceeded ${DEPLOY_TIMEOUT_SECONDS}s." >&2
        cleanup_lock_after_hard_timeout || true
        return 124
        ;;
    esac
    return "$status"
  fi
  echo "WARNING: timeout utility unavailable; using portable watchdog fallback." >&2
  run_timeout_fallback "$action"
  status=$?
  if [ "$status" -eq 124 ]; then
    cleanup_lock_after_hard_timeout || true
  fi
  return "$status"
}

rotate_log() {
  mkdir -p "$LOG_DIR" || return 1
  [ -f "$LOG_FILE" ] || return 0
  size=$(wc -c < "$LOG_FILE" 2>/dev/null || printf '0')
  is_uint "$size" || size=0
  [ "$size" -lt "$DEPLOY_LOG_MAX_BYTES" ] && return 0

  generation=$DEPLOY_LOG_FILES
  while [ "$generation" -gt 1 ]; do
    previous=$((generation - 1))
    if [ -f "$LOG_FILE.$previous" ] && ! mv -f "$LOG_FILE.$previous" "$LOG_FILE.$generation"; then
      echo "ERROR: Could not rotate $LOG_FILE.$previous." >&2
      return 1
    fi
    generation=$previous
  done
  if ! mv -f "$LOG_FILE" "$LOG_FILE.1"; then
    echo "ERROR: Could not rotate $LOG_FILE." >&2
    return 1
  fi
}

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

# shellcheck disable=SC2329
cleanup_lock() {
  rm -f "$LOCK_DIR/pid" "$LOCK_DIR/started_at" 2>/dev/null || true
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

cleanup_probe() {
  [ -n "$PROBE_CONTAINER" ] || return 0
  [ -n "${DOCKER_BIN:-}" ] || return 0
  if "$DOCKER_BIN" container inspect "$PROBE_CONTAINER" >/dev/null 2>&1; then
    "$DOCKER_BIN" container stop --time 5 "$PROBE_CONTAINER" >/dev/null 2>&1 || true
    "$DOCKER_BIN" container rm "$PROBE_CONTAINER" >/dev/null 2>&1 || true
  fi
  PROBE_CONTAINER=""
}

# shellcheck disable=SC2329
cleanup_self_snapshot() {
  [ -n "$SELF_SNAPSHOT" ] || return 0
  [ "$SELF" = "$SELF_SNAPSHOT" ] || return 0
  rm -f "$SELF_SNAPSHOT" 2>/dev/null || true
  rmdir "$(dirname -- "$SELF_SNAPSHOT")" 2>/dev/null || true
}

# shellcheck disable=SC2329
cleanup_worker() {
  cleanup_probe
  cleanup_lock
  cleanup_self_snapshot
}

write_phase() {
  DEPLOY_PHASE="$1"
  printf '%s\n' "$DEPLOY_PHASE" > "$DEPLOY_RUNTIME_DIR/.deploy-phase" 2>/dev/null || true
}

# shellcheck disable=SC2329
quick_signal_rollback() {
  [ "$ROLLBACK_READY" = true ] || return 0
  [ "$ROLLBACK_IN_PROGRESS" = false ] || return 0
  case "$DEPLOY_PHASE" in starting|verifying) ;; *) return 0 ;; esac
  ROLLBACK_IN_PROGRESS=true
  log "WARNING: Deployment interrupted during $DEPLOY_PHASE; requesting quick rollback to $DEPLOY_ROLLBACK_IMAGE."
  if [ "$LEGACY_ROLLBACK" = true ]; then
    if compose_with_files "$LEGACY_COMPOSE_BACKUP" "$LEGACY_COMPOSE_OVERRIDE" up -d --remove-orphans --no-build; then
      "$DOCKER_BIN" update --restart on-failure:3 "$DEPLOY_CONTAINER_NAME" >/dev/null 2>&1 || true
      log "Quick legacy rollback start requested. Run --verify-only after the interrupted task exits."
      return 0
    fi
    log "ERROR: Quick legacy rollback request failed. Persistent mounts were not removed."
    return 1
  fi
  set_compose_image "$DEPLOY_ROLLBACK_IMAGE"
  if compose up -d --remove-orphans --no-build; then
    log "Quick rollback start requested. Run --verify-only after the interrupted task exits."
  else
    log "ERROR: Quick rollback request failed. Persistent mounts were not removed."
  fi
}

# shellcheck disable=SC2329
handle_signal() {
  exit_code="$1"
  signal_name="$2"
  trap - HUP INT TERM
  log "WARNING: Received $signal_name during phase=$DEPLOY_PHASE."
  quick_signal_rollback || true
  cleanup_worker
  exit "$exit_code"
}

acquire_lock() {
  mkdir -p "$DEPLOY_RUNTIME_DIR" "$LOG_DIR" || return 1
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    trap cleanup_worker EXIT
    trap 'handle_signal 129 HUP' HUP
    trap 'handle_signal 130 INT' INT
    trap 'handle_signal 143 TERM' TERM
    printf '%s\n' "$$" > "$LOCK_DIR/pid" || return 1
    date +%s > "$LOCK_DIR/started_at" || return 1
    return 0
  fi

  lock_pid=$(sed -n '1p' "$LOCK_DIR/pid" 2>/dev/null || true)
  if is_uint "$lock_pid" && kill -0 "$lock_pid" 2>/dev/null; then
    echo "ERROR: $DEPLOY_SITE_NAME deployment already running with pid $lock_pid." >&2
    return 75
  fi

  # Never steal a lock from a live process. The supervisor owns the hard
  # timeout; a second scheduler invocation must fail instead of overlapping.
  rm -f "$LOCK_DIR/pid" "$LOCK_DIR/started_at" 2>/dev/null || true
  rmdir "$LOCK_DIR" 2>/dev/null || {
    echo "ERROR: Refusing to remove non-standard lock contents at $LOCK_DIR." >&2
    return 1
  }
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "ERROR: Could not acquire deployment lock: $LOCK_DIR" >&2
    return 75
  fi
  trap cleanup_worker EXIT
  trap 'handle_signal 129 HUP' HUP
  trap 'handle_signal 130 INT' INT
  trap 'handle_signal 143 TERM' TERM
  printf '%s\n' "$$" > "$LOCK_DIR/pid" || return 1
  date +%s > "$LOCK_DIR/started_at" || return 1
}

read_env_value() {
  key="$1"
  [ -f "$DEPLOY_ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$DEPLOY_ENV_FILE" | tail -n 1 | sed 's/\r$//'
}

load_runtime_boundary() {
  runtime_image=$(read_env_value "$DEPLOY_IMAGE_ENV_KEY")
  if [ -z "$SOURCE_SHA" ] && [ -n "$runtime_image" ]; then
    DEPLOY_IMAGE="$runtime_image"
  fi
  if [ -n "${DEPLOY_PORT_ENV_KEY:-}" ]; then
    runtime_port=$(read_env_value "$DEPLOY_PORT_ENV_KEY")
    if is_uint "$runtime_port" && [ "$runtime_port" -ge 1 ] && [ "$runtime_port" -le 65535 ]; then
      DEPLOY_HOST_PORT="$runtime_port"
    fi
  fi
  runtime_container=$(read_env_value CONTAINER_NAME)
  [ -n "$runtime_container" ] && DEPLOY_CONTAINER_NAME="$runtime_container"
  if [ -z "${DEPLOY_HEALTH_URL:-}" ]; then
    DEPLOY_HEALTH_URL="http://127.0.0.1:${DEPLOY_HOST_PORT}${DEPLOY_HEALTH_PATH}"
  fi
}

resolve_runtime_tools() {
  DOCKER_BIN=$(resolve_binary docker \
    /var/packages/ContainerManager/target/usr/bin/docker \
    /var/packages/Docker/target/usr/bin/docker \
    /volume1/@appstore/ContainerManager/usr/bin/docker \
    /volume1/@appstore/Docker/usr/bin/docker 2>/dev/null || true)
  [ -n "$DOCKER_BIN" ] || { log "ERROR: Docker command not found in safe Synology paths."; return 127; }
  "$DOCKER_BIN" info >/dev/null 2>&1 || { log "ERROR: Docker daemon is not reachable."; return 1; }

  if "$DOCKER_BIN" compose version >/dev/null 2>&1; then
    COMPOSE_MODE=plugin
  else
    COMPOSE_BIN=$(resolve_binary docker-compose \
      /var/packages/ContainerManager/target/usr/bin/docker-compose \
      /var/packages/Docker/target/usr/bin/docker-compose \
      /volume1/@appstore/ContainerManager/usr/bin/docker-compose \
      /volume1/@appstore/Docker/usr/bin/docker-compose 2>/dev/null || true)
    [ -n "$COMPOSE_BIN" ] || { log "ERROR: Docker Compose command not found."; return 127; }
    COMPOSE_MODE=standalone
  fi
}

update_source_and_select_image() {
  GIT_BIN=$(resolve_binary git \
    /var/packages/Git/target/bin/git \
    /volume1/@appstore/Git/bin/git \
    /usr/local/bin/git /usr/bin/git 2>/dev/null || true)
  [ -n "$GIT_BIN" ] || { log "ERROR: Git command not found in safe Synology paths."; return 127; }
  [ -d "$DEPLOY_APP_DIR/.git" ] || { log "ERROR: Deployment source is not a Git checkout: $DEPLOY_APP_DIR"; return 1; }
  log "Updating deployment control files with git pull --ff-only inside the deployment lock."
  if ! "$GIT_BIN" -C "$DEPLOY_APP_DIR" pull --ff-only origin main; then
    log "ERROR: Git pull failed. Existing container was not changed."
    return 1
  fi
  SOURCE_SHA=$("$GIT_BIN" -C "$DEPLOY_APP_DIR" rev-parse HEAD 2>/dev/null || true)
  case "$SOURCE_SHA" in ""|*[!0-9a-f]*) log "ERROR: Git HEAD is not a hexadecimal commit SHA: $SOURCE_SHA"; return 1 ;; esac
  [ "${#SOURCE_SHA}" -eq 40 ] || { log "ERROR: Git HEAD is not a full 40-character commit SHA: $SOURCE_SHA"; return 1; }
  DEPLOY_IMAGE="$DEPLOY_IMAGE_REPOSITORY:sha-$SOURCE_SHA"
  log "Selected immutable deployment image: $DEPLOY_IMAGE"
}

snapshot_legacy_compose() {
  current_compose="$DEPLOY_COMPOSE_FILE"
  [ -f "$current_compose" ] || return 0
  if ! grep -Eq 'image:[[:space:]]*node:|npm (ci|install|run build)|APP_SOURCE_DIR.*/app' "$current_compose"; then
    return 0
  fi
  LEGACY_COMPOSE_BACKUP="$DEPLOY_RUNTIME_DIR/docker-compose.legacy-rollback.yml"
  cp "$current_compose" "$LEGACY_COMPOSE_BACKUP" || { log "ERROR: Could not preserve legacy Compose rollback file."; return 1; }
  chmod 600 "$LEGACY_COMPOSE_BACKUP" 2>/dev/null || true
  log "Preserved first-migration legacy Compose rollback: $LEGACY_COMPOSE_BACKUP"
}

load_persisted_rollback_mode() {
  marker_file="$DEPLOY_RUNTIME_DIR/.rollback-state"
  [ -f "$marker_file" ] || return 0
  persisted_mode=$(sed -n 's/^rollback_mode=//p' "$marker_file" | tail -n 1)
  case "$persisted_mode" in
    legacy)
      LEGACY_COMPOSE_BACKUP="$DEPLOY_RUNTIME_DIR/docker-compose.legacy-rollback.yml"
      LEGACY_COMPOSE_OVERRIDE="$DEPLOY_RUNTIME_DIR/docker-compose.legacy-rollback.override.yml"
      [ -f "$LEGACY_COMPOSE_BACKUP" ] || { log "ERROR: Persisted legacy rollback file is missing: $LEGACY_COMPOSE_BACKUP"; return 1; }
      [ -f "$LEGACY_COMPOSE_OVERRIDE" ] || { log "ERROR: Persisted legacy rollback override is missing: $LEGACY_COMPOSE_OVERRIDE"; return 1; }
      LEGACY_ROLLBACK=true
      ROLLBACK_READY=true
      ;;
    image)
      LEGACY_ROLLBACK=false
      ROLLBACK_READY=true
      ;;
  esac
}

select_verify_mode_for_current_container() {
  current_image=$("$DOCKER_BIN" inspect -f '{{.Config.Image}}' "$DEPLOY_CONTAINER_NAME" 2>/dev/null || true)
  case "$current_image" in
    "$DEPLOY_IMAGE_REPOSITORY":*) VERIFY_MODE=normal ;;
    *)
      if [ -f "$DEPLOY_RUNTIME_DIR/.rollback-state" ] &&
         [ "$(sed -n 's/^rollback_mode=//p' "$DEPLOY_RUNTIME_DIR/.rollback-state" | tail -n 1)" = legacy ]; then
        VERIFY_MODE=legacy
        DEPLOY_HEALTH_URL="http://127.0.0.1:${DEPLOY_HOST_PORT}/"
      fi
      ;;
  esac
}

compose() {
  if [ "$COMPOSE_MODE" = plugin ]; then
    "$DOCKER_BIN" compose -f "$DEPLOY_COMPOSE_FILE" --env-file "$DEPLOY_ENV_FILE" "$@"
  else
    "$COMPOSE_BIN" -f "$DEPLOY_COMPOSE_FILE" --env-file "$DEPLOY_ENV_FILE" "$@"
  fi
}

compose_with_files() {
  first_file="$1"
  second_file="$2"
  shift 2
  if [ "$COMPOSE_MODE" = plugin ]; then
    "$DOCKER_BIN" compose -f "$first_file" -f "$second_file" --env-file "$DEPLOY_ENV_FILE" "$@"
  else
    "$COMPOSE_BIN" -f "$first_file" -f "$second_file" --env-file "$DEPLOY_ENV_FILE" "$@"
  fi
}

set_compose_image() {
  image_ref="$1"
  export "$DEPLOY_IMAGE_ENV_KEY=$image_ref"
}

http_status() {
  curl_bin=$(resolve_binary curl /usr/bin/curl /bin/curl 2>/dev/null || true)
  if [ -n "$curl_bin" ]; then
    "$curl_bin" -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$DEPLOY_HEALTH_URL" 2>/dev/null || printf '000'
    return 0
  fi
  wget_bin=$(resolve_binary wget /usr/bin/wget /bin/wget 2>/dev/null || true)
  if [ -n "$wget_bin" ]; then
    "$wget_bin" -S -O /dev/null -T 10 "$DEPLOY_HEALTH_URL" 2>&1 |
      sed -n 's/.*HTTP\/[0-9.]* \([0-9][0-9][0-9]\).*/\1/p' | tail -n 1
    return 0
  fi
  printf 'unavailable'
}

log_container_tail() {
  "$DOCKER_BIN" logs --tail 80 "$DEPLOY_CONTAINER_NAME" 2>&1 |
    while IFS= read -r line; do log "DOCKER_LOG: $line"; done
}

verify_runtime() {
  deadline=$(($(date +%s) + DEPLOY_VERIFY_SECONDS))
  last_state=unknown
  last_health=unknown
  last_http=000
  while [ "$(date +%s)" -le "$deadline" ]; do
    if ! "$DOCKER_BIN" container inspect "$DEPLOY_CONTAINER_NAME" >/dev/null 2>&1; then
      last_state=missing
    else
      last_state=$("$DOCKER_BIN" inspect -f '{{.State.Status}}' "$DEPLOY_CONTAINER_NAME" 2>/dev/null || printf 'unknown')
      last_health=$("$DOCKER_BIN" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$DEPLOY_CONTAINER_NAME" 2>/dev/null || printf 'unknown')
      last_http=$(http_status)
      if [ "$last_state" = running ] && [ "$last_health" = healthy ]; then
        if [ "$VERIFY_MODE" = normal ] && [ "$last_http" = 200 ]; then
          log "VERIFY_OK: container=$DEPLOY_CONTAINER_NAME state=running health=healthy http=200 url=$DEPLOY_HEALTH_URL"
          return 0
        fi
        if [ "$VERIFY_MODE" = legacy ] && { [ "$last_http" = 200 ] || [ "$last_http" = 401 ]; }; then
          log "VERIFY_OK_LEGACY: container=$DEPLOY_CONTAINER_NAME state=running health=healthy http=$last_http url=$DEPLOY_HEALTH_URL"
          return 0
        fi
      fi
      case "$last_state" in exited|dead|removing)
        break
        ;;
      esac
    fi
    sleep 5
  done
  log "ERROR: Verification failed: container=$DEPLOY_CONTAINER_NAME state=$last_state health=$last_health http=$last_http url=$DEPLOY_HEALTH_URL"
  log_container_tail || true
  return 1
}

probe_prebuilt_image() {
  PROBE_CONTAINER="${DEPLOY_SITE_NAME}-probe-$(date +%s)-$$"
  log "Probing prebuilt image before touching the production container: $DEPLOY_IMAGE"
  if ! "$DOCKER_BIN" run -d \
    --name "$PROBE_CONTAINER" \
    --restart no \
    --env NODE_ENV=production \
    --env PORT=3000 \
    "$DEPLOY_IMAGE" >/dev/null; then
    log "ERROR: Could not start isolated image probe. Production container was not changed."
    cleanup_probe
    return 1
  fi

  probe_deadline=$(($(date +%s) + 90))
  probe_state=unknown
  probe_health=unknown
  while [ "$(date +%s)" -le "$probe_deadline" ]; do
    probe_state=$("$DOCKER_BIN" inspect -f '{{.State.Status}}' "$PROBE_CONTAINER" 2>/dev/null || printf missing)
    probe_health=$("$DOCKER_BIN" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$PROBE_CONTAINER" 2>/dev/null || printf unknown)
    if [ "$probe_state" = running ] && [ "$probe_health" = healthy ]; then
      log "Prebuilt image probe passed: state=running health=healthy"
      cleanup_probe
      return 0
    fi
    case "$probe_state" in exited|dead|missing) break ;; esac
    sleep 3
  done
  log "ERROR: Prebuilt image probe failed: state=$probe_state health=$probe_health. Production container was not changed."
  "$DOCKER_BIN" logs --tail 80 "$PROBE_CONTAINER" 2>&1 |
    while IFS= read -r line; do log "PROBE_LOG: $line"; done
  cleanup_probe
  return 1
}

capture_rollback_image() {
  PREVIOUS_IMAGE_ID=""
  if ! "$DOCKER_BIN" container inspect "$DEPLOY_CONTAINER_NAME" >/dev/null 2>&1; then
    log "No existing $DEPLOY_CONTAINER_NAME container; this is a first deployment without automatic rollback."
    return 0
  fi
  previous_config_image=$("$DOCKER_BIN" inspect -f '{{.Config.Image}}' "$DEPLOY_CONTAINER_NAME" 2>/dev/null || true)
  case "$previous_config_image" in
    "$DEPLOY_IMAGE_REPOSITORY":*) ;;
    *)
      LEGACY_COMPOSE_BACKUP="$DEPLOY_RUNTIME_DIR/docker-compose.legacy-rollback.yml"
      if [ ! -f "$LEGACY_COMPOSE_BACKUP" ]; then
        log "ERROR: Existing container uses legacy image '$previous_config_image', but no legacy Compose backup exists. Failing closed before replacement."
        return 1
      fi
      running_state=$("$DOCKER_BIN" inspect -f '{{.State.Running}}' "$DEPLOY_CONTAINER_NAME" 2>/dev/null || printf false)
      [ "$running_state" = true ] || { log "ERROR: Legacy container is not running; refusing a cutover without a known-good rollback runtime."; return 1; }
      if ! "$DOCKER_BIN" exec "$DEPLOY_CONTAINER_NAME" sh -lc 'test -f /app/.next/BUILD_ID && test -x /app/node_modules/.bin/next'; then
        log "ERROR: Legacy container lacks a prebuilt .next artifact or Next.js binary. Failing closed before replacement; NAS build is forbidden."
        return 1
      fi
      LEGACY_COMPOSE_OVERRIDE="$DEPLOY_RUNTIME_DIR/docker-compose.legacy-rollback.override.yml"
      override_tmp="$LEGACY_COMPOSE_OVERRIDE.tmp.$$"
      if ! {
        printf '%s\n' 'version: "3.3"'
        printf '%s\n' 'services:'
        printf '  %s:\n' "$DEPLOY_SERVICE"
        printf '%s\n' '    restart: "on-failure:3"'
        printf '%s\n' '    command:'
        printf '%s\n' '      - sh'
        printf '%s\n' '      - -lc'
        printf '%s\n' '      - >'
        printf '%s\n' '        set -eu;'
        printf '%s\n' '        test -f /app/.next/BUILD_ID;'
        printf '%s\n' '        test -x /app/node_modules/.bin/next;'
        printf '%s\n' '        exec /app/node_modules/.bin/next start --hostname 0.0.0.0 --port 3000'
        printf '%s\n' '    healthcheck:'
        printf '%s\n' '      test:'
        printf '%s\n' '        - CMD-SHELL'
        printf '%s\n' '        - >'
        printf '%s\n' '          node -e "fetch('\''http://127.0.0.1:3000/'\'').then(r=>process.exit(r.status === 200 || r.status === 401 ? 0 : 1)).catch(()=>process.exit(1))"'
        printf '%s\n' '      interval: 20s'
        printf '%s\n' '      timeout: 5s'
        printf '%s\n' '      retries: 6'
        printf '%s\n' '      start_period: 20s'
      } > "$override_tmp"; then
        rm -f "$override_tmp"
        log "ERROR: Could not write legacy rollback override. Failing closed before replacement."
        return 1
      fi
      chmod 600 "$override_tmp" 2>/dev/null || true
      if ! mv "$override_tmp" "$LEGACY_COMPOSE_OVERRIDE"; then
        rm -f "$override_tmp"
        log "ERROR: Could not publish legacy rollback override. Failing closed before replacement."
        return 1
      fi
      state_tmp="$DEPLOY_RUNTIME_DIR/.rollback-state.tmp.$$"
      if ! {
        printf 'rollback_mode=legacy\n'
        printf 'captured_at=%s\n' "$(date +%s)"
        printf 'compose_file=%s\n' "$LEGACY_COMPOSE_BACKUP"
        printf 'override_file=%s\n' "$LEGACY_COMPOSE_OVERRIDE"
      } > "$state_tmp"; then
        rm -f "$state_tmp"
        log "ERROR: Could not write legacy rollback state. Failing closed before replacement."
        return 1
      fi
      chmod 600 "$state_tmp" 2>/dev/null || true
      if ! mv "$state_tmp" "$DEPLOY_RUNTIME_DIR/.rollback-state"; then
        rm -f "$state_tmp"
        log "ERROR: Could not publish legacy rollback state. Failing closed before replacement."
        return 1
      fi
      LEGACY_ROLLBACK=true
      ROLLBACK_READY=true
      log "Legacy first-migration rollback is armed with $LEGACY_COMPOSE_BACKUP."
      return 0
      ;;
  esac
  PREVIOUS_IMAGE_ID=$("$DOCKER_BIN" inspect -f '{{.Image}}' "$DEPLOY_CONTAINER_NAME" 2>/dev/null || true)
  [ -n "$PREVIOUS_IMAGE_ID" ] || { log "ERROR: Could not capture the current image for rollback."; return 1; }
  if ! "$DOCKER_BIN" image tag "$PREVIOUS_IMAGE_ID" "$DEPLOY_ROLLBACK_IMAGE"; then
    log "ERROR: Could not tag current image $PREVIOUS_IMAGE_ID as $DEPLOY_ROLLBACK_IMAGE. Deployment aborted before changing the container."
    return 1
  fi
  ROLLBACK_READY=true
  state_tmp="$DEPLOY_RUNTIME_DIR/.rollback-state.tmp.$$"
  if ! {
    printf 'rollback_mode=image\n'
    printf 'captured_at=%s\n' "$(date +%s)"
    printf 'rollback_image=%s\n' "$DEPLOY_ROLLBACK_IMAGE"
  } > "$state_tmp"; then
    rm -f "$state_tmp"
    log "ERROR: Could not write image rollback state. Deployment aborted before replacement."
    return 1
  fi
  chmod 600 "$state_tmp" 2>/dev/null || true
  if ! mv "$state_tmp" "$DEPLOY_RUNTIME_DIR/.rollback-state"; then
    rm -f "$state_tmp"
    log "ERROR: Could not publish image rollback state. Deployment aborted before replacement."
    return 1
  fi
  log "Rollback image prepared: $DEPLOY_ROLLBACK_IMAGE ($PREVIOUS_IMAGE_ID)"
}

rollback_runtime() {
  ROLLBACK_IN_PROGRESS=true
  if [ "$LEGACY_ROLLBACK" = true ]; then
    [ -f "$LEGACY_COMPOSE_BACKUP" ] || { log "ERROR: Legacy rollback Compose file is unavailable."; return 1; }
    [ -f "$LEGACY_COMPOSE_OVERRIDE" ] || { log "ERROR: Legacy rollback Compose override is unavailable."; return 1; }
    log "Restoring legacy Compose with pre-existing artifacts only; no NAS install/build or persistent mount removal."
    compose_with_files "$LEGACY_COMPOSE_BACKUP" "$LEGACY_COMPOSE_OVERRIDE" config >/dev/null || { log "ERROR: Legacy rollback Compose config validation failed."; return 1; }
    compose_with_files "$LEGACY_COMPOSE_BACKUP" "$LEGACY_COMPOSE_OVERRIDE" up -d --remove-orphans --no-build || { log "ERROR: Legacy rollback Compose up failed."; return 1; }
    "$DOCKER_BIN" update --restart on-failure:3 "$DEPLOY_CONTAINER_NAME" >/dev/null 2>&1 || log "WARNING: Could not bound the restored legacy container restart count."
    VERIFY_MODE=legacy
    DEPLOY_HEALTH_URL="http://127.0.0.1:${DEPLOY_HOST_PORT}/"
    verify_runtime
    rollback_status=$?
    ROLLBACK_IN_PROGRESS=false
    return "$rollback_status"
  fi
  if ! "$DOCKER_BIN" image inspect "$DEPLOY_ROLLBACK_IMAGE" >/dev/null 2>&1; then
    log "ERROR: Rollback image is unavailable: $DEPLOY_ROLLBACK_IMAGE"
    return 1
  fi
  log "Rolling back $DEPLOY_SITE_NAME to $DEPLOY_ROLLBACK_IMAGE without removing persistent mounts."
  set_compose_image "$DEPLOY_ROLLBACK_IMAGE"
  compose config >/dev/null || { log "ERROR: Rollback Compose config validation failed."; return 1; }
  compose up -d --remove-orphans --no-build || { log "ERROR: Rollback Compose up failed."; return 1; }
  verify_runtime
  rollback_status=$?
  ROLLBACK_IN_PROGRESS=false
  return "$rollback_status"
}

deploy_runtime() {
  [ -f "$DEPLOY_COMPOSE_FILE" ] || { log "ERROR: Compose file missing: $DEPLOY_COMPOSE_FILE"; return 1; }
  [ -f "$DEPLOY_ENV_FILE" ] || { log "ERROR: Runtime env missing: $DEPLOY_ENV_FILE"; return 1; }
  set_compose_image "$DEPLOY_IMAGE"
  compose config >/dev/null || { log "ERROR: Compose config validation failed."; return 1; }
  capture_rollback_image || return $?
  log "Pulling prebuilt image: $DEPLOY_IMAGE"
  compose pull "$DEPLOY_SERVICE" || { log "ERROR: Compose pull failed; existing container was not replaced."; return 1; }
  probe_prebuilt_image || return $?
  log "Starting $DEPLOY_SITE_NAME with detached Compose and no NAS build."
  write_phase starting
  if ! compose up -d --remove-orphans --no-build; then
    log "ERROR: Compose up failed; attempting automatic rollback."
    rollback_runtime || log "ERROR: Automatic rollback also failed. Persistent mounts were not removed."
    return 1
  fi
  write_phase verifying
  if ! verify_runtime; then
    log "ERROR: New deployment failed strict verification; attempting automatic rollback."
    rollback_runtime || log "ERROR: Automatic rollback also failed. Persistent mounts were not removed."
    return 1
  fi
  write_phase complete
  rm -f "$DEPLOY_RUNTIME_DIR/.deploy-phase"
  log "Deployment completed successfully: image=$DEPLOY_IMAGE"
}

worker_main() {
  action="$1"
  rotate_log || { echo "ERROR: Could not initialize bounded deploy log." >&2; return 1; }
  acquire_lock || return $?
  log "$DEPLOY_SITE_NAME action started: $action pid=$$ timeout=${DEPLOY_TIMEOUT_SECONDS}s"
  write_phase preparing

  if [ "$action" = deploy ]; then
    snapshot_legacy_compose || return $?
    update_source_and_select_image || return $?
  fi

  if [ "$action" = deploy ] && [ -n "$PREPARE_HOOK" ]; then
    [ -f "$PREPARE_HOOK" ] || { log "ERROR: Prepare hook is missing: $PREPARE_HOOK"; return 1; }
    rm -f "$DEPLOY_RUNTIME_DIR/.prepare-ok"
    /bin/sh "$PREPARE_HOOK" --prepare 2>&1 | while IFS= read -r line; do log "PREPARE: $line"; done
    # POSIX pipelines report the final logger status; require a completion marker from the hook.
    [ -f "$DEPLOY_RUNTIME_DIR/.prepare-ok" ] || { log "ERROR: Site prepare hook did not complete successfully."; return 1; }
    rm -f "$DEPLOY_RUNTIME_DIR/.prepare-ok"
  fi

  load_runtime_boundary
  resolve_runtime_tools || return $?
  if [ "$action" = rollback ]; then
    load_persisted_rollback_mode || return $?
  elif [ "$action" = verify-only ]; then
    select_verify_mode_for_current_container
  fi
  case "$action" in
    deploy) deploy_runtime ;;
    rollback) rollback_runtime ;;
    verify-only) verify_runtime ;;
    *) log "ERROR: Unsupported action: $action"; return 64 ;;
  esac
}

load_site_config || exit $?

if [ "${1:-}" = --worker ]; then
  case "${2:-}" in
    deploy|rollback|verify-only) worker_main "$2"; exit $? ;;
    *) usage; exit 64 ;;
  esac
fi

case "${1:---deploy}" in
  --deploy) ACTION=deploy ;;
  --rollback) ACTION=rollback ;;
  --verify-only) ACTION=verify-only ;;
  *) usage; exit 64 ;;
esac

trap cleanup_self_snapshot EXIT
run_supervised "$ACTION"
exit $?
