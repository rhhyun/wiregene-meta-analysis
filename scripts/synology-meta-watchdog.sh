#!/bin/sh
set -u

APP_DIR="${APP_DIR:-/volume1/docker/wiregene-meta-analysis}"
RUNTIME_DIR="${META_RUNTIME_DIR:-/volume1/docker/meta}"
LOG_DIR="${META_LOG_DIR:-$RUNTIME_DIR/logs}"
LOG_FILE="$LOG_DIR/meta-watchdog.log"
LOCK_DIR="$RUNTIME_DIR/.watchdog-lock"
CONTAINER_NAME="${CONTAINER_NAME:-wiregene-meta}"
WATCHDOG_PULL="${META_WATCHDOG_PULL:-false}"
RESTART_UNHEALTHY="${META_WATCHDOG_RESTART_UNHEALTHY:-false}"
LOG_TAIL="${META_WATCHDOG_LOG_TAIL:-120}"
RESTART_LOOP_THRESHOLD="${META_WATCHDOG_RESTART_LOOP_THRESHOLD:-3}"

log() {
  mkdir -p "$LOG_DIR"
  printf "%s %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

finish() {
  log "Wiregene Meta watchdog finished. Exiting 0 so DSM does not create a scheduler failure notification."
  exit 0
}

cleanup_lock() {
  if [ -d "$LOCK_DIR" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}

acquire_lock_or_exit() {
  mkdir -p "$RUNTIME_DIR" "$LOG_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    trap cleanup_lock EXIT INT TERM
    printf "%s\n" "$$" > "$LOCK_DIR/pid" 2>/dev/null || true
    return 0
  fi

  lock_pid=""
  [ -f "$LOCK_DIR/pid" ] && lock_pid=$(sed -n '1p' "$LOCK_DIR/pid" 2>/dev/null || true)
  if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
    log "Another Wiregene Meta watchdog is already running with pid $lock_pid."
    finish
  fi

  log "Removing stale watchdog lock at $LOCK_DIR."
  rm -rf "$LOCK_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "Could not acquire watchdog lock at $LOCK_DIR."
    finish
  fi
  trap cleanup_lock EXIT INT TERM
  printf "%s\n" "$$" > "$LOCK_DIR/pid" 2>/dev/null || true
}

env_value() {
  key="$1"
  [ -f "$RUNTIME_DIR/.env" ] || return 0
  sed -n "s/^${key}=//p" "$RUNTIME_DIR/.env" | tail -n 1 | sed "s/\r$//"
}

refresh_container_name() {
  configured_container=$(env_value CONTAINER_NAME)
  [ -n "$configured_container" ] && CONTAINER_NAME="$configured_container"
}

log_docker_tail() {
  if command -v docker >/dev/null 2>&1 && docker ps -a --format '{{.Names}}' | grep -x "$CONTAINER_NAME" >/dev/null 2>&1; then
    log "RECENT_DOCKER_LOGS_BEGIN: tail=$LOG_TAIL"
    docker logs --tail "$LOG_TAIL" "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do
      log "DOCKER_LOG: $line"
    done
    log "RECENT_DOCKER_LOGS_END"
  fi
}

pull_latest_if_requested() {
  [ "$WATCHDOG_PULL" = "true" ] || return 0
  if [ ! -d "$APP_DIR/.git" ]; then
    log "WARNING: META_WATCHDOG_PULL=true but $APP_DIR is not a Git checkout."
    return 0
  fi
  if ! command -v git >/dev/null 2>&1; then
    log "WARNING: META_WATCHDOG_PULL=true but git is unavailable."
    return 0
  fi
  log "META_WATCHDOG_PULL=true; attempting git pull --ff-only."
  if git -C "$APP_DIR" pull --ff-only origin main >> "$LOG_FILE" 2>&1; then
    log "Git pull completed."
  else
    log "WARNING: git pull failed. Keeping current checkout and continuing watchdog without DSM failure."
  fi
}

start_meta_without_dsm_failure() {
  if [ ! -f "$APP_DIR/scripts/synology-start-meta.sh" ]; then
    log "ERROR: start script is missing: $APP_DIR/scripts/synology-start-meta.sh"
    log_docker_tail
    finish
  fi

  log "Starting Wiregene Meta because watchdog found the container unavailable."
  if META_FORCE_RECREATE=false /bin/sh "$APP_DIR/scripts/synology-start-meta.sh" >> "$LOG_FILE" 2>&1; then
    log "Start script completed."
  else
    log "ERROR: start script failed. See the log above and docker logs below."
    log_docker_tail
  fi
  finish
}

log "Wiregene Meta watchdog requested."
acquire_lock_or_exit
pull_latest_if_requested
refresh_container_name

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker command is unavailable."
  finish
fi

if ! docker info >/dev/null 2>&1; then
  log "ERROR: Docker daemon is not reachable."
  finish
fi

if ! docker ps -a --format '{{.Names}}' | grep -x "$CONTAINER_NAME" >/dev/null 2>&1; then
  log "Container $CONTAINER_NAME does not exist."
  start_meta_without_dsm_failure
fi

running=$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || printf 'false')
status=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
oom_killed=$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
restart_count=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')

log "CONTAINER_STATE: running=$running status=$status exitCode=$exit_code oomKilled=$oom_killed health=$health restartCount=$restart_count"

case "$status" in
  restarting)
    log "ERROR: Container $CONTAINER_NAME is in a Docker restart loop. running=$running exitCode=$exit_code restartCount=$restart_count"
    if [ "$exit_code" = "127" ]; then
      log "ERROR_HINT: exitCode=127 usually means a command was not found inside the container, commonly a missing npm/next binary or broken node_modules install."
    fi
    log_docker_tail
    start_meta_without_dsm_failure
    ;;
esac

if [ "$running" != "true" ]; then
  log "Container $CONTAINER_NAME is not running; attempting a non-forced restart."
  log_docker_tail
  start_meta_without_dsm_failure
fi

case "$restart_count" in
  *[!0-9]*)
    ;;
  *)
    if [ "$restart_count" -ge "$RESTART_LOOP_THRESHOLD" ] && [ "$health" = "unhealthy" ]; then
      log "ERROR: Container $CONTAINER_NAME has restartCount=$restart_count and health=unhealthy. Treating this as crash-loop evidence."
      log_docker_tail
      start_meta_without_dsm_failure
    fi
    ;;
esac

if [ "$health" = "unhealthy" ]; then
  if [ "$RESTART_UNHEALTHY" = "true" ]; then
    log "META_WATCHDOG_RESTART_UNHEALTHY=true; restarting unhealthy container with non-forced start script."
    log_docker_tail
    start_meta_without_dsm_failure
  fi
  log "WARNING: Container $CONTAINER_NAME is unhealthy but running. Not restarting because META_WATCHDOG_RESTART_UNHEALTHY=false."
  finish
fi

log "Container $CONTAINER_NAME is already running; no Docker recreate or restart needed."
finish
