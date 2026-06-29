#!/bin/sh
set -u

APP_DIR="${APP_DIR:-/volume1/docker/wiregene-meta-analysis}"
RUNTIME_DIR="${META_RUNTIME_DIR:-/volume1/docker/meta}"
LOG_DIR="${META_LOG_DIR:-$RUNTIME_DIR/logs}"
LOG_FILE="$LOG_DIR/meta-status.log"
CONTAINER_NAME="${CONTAINER_NAME:-wiregene-meta}"
LOG_TAIL="${META_STATUS_LOG_TAIL:-160}"

log() {
  mkdir -p "$LOG_DIR"
  printf "%s %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

env_value() {
  key="$1"
  [ -f "$RUNTIME_DIR/.env" ] || return 0
  sed -n "s/^${key}=//p" "$RUNTIME_DIR/.env" | tail -n 1 | sed "s/\r$//"
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    return 127
  fi
}

log "Wiregene Meta DSM status requested."
log "APP_DIR=$APP_DIR"
log "RUNTIME_DIR=$RUNTIME_DIR"

if [ -d "$APP_DIR/.git" ] && command -v git >/dev/null 2>&1; then
  git_head=$(git -C "$APP_DIR" log -1 --oneline 2>/dev/null || true)
  git_status=$(git -C "$APP_DIR" status --short --branch 2>/dev/null | sed -n '1p' || true)
  log "GIT_HEAD: ${git_head:-unavailable}"
  log "GIT_STATUS: ${git_status:-unavailable}"
else
  log "WARNING: $APP_DIR is not a readable Git checkout or git is unavailable."
fi

if [ -f "$RUNTIME_DIR/.env" ]; then
  host_port=$(env_value HOST_PORT)
  [ -n "$host_port" ] || host_port="3001"
  configured_container=$(env_value CONTAINER_NAME)
  [ -n "$configured_container" ] && CONTAINER_NAME="$configured_container"
  log "ENV_SUMMARY: HOST_PORT=$host_port CONTAINER_NAME=$CONTAINER_NAME META_FORCE_RECREATE=$(env_value META_FORCE_RECREATE) META_REQUIRE_HEALTHY=$(env_value META_REQUIRE_HEALTHY)"
else
  host_port="3001"
  log "WARNING: Runtime env file is missing: $RUNTIME_DIR/.env"
fi

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker command is unavailable."
  log "Status report completed with Docker unavailable. Exiting 0 so this diagnostic task does not create another DSM failure notification."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  log "ERROR: Docker daemon is not reachable."
  log "Status report completed with Docker daemon unavailable. Exiting 0 so this diagnostic task does not create another DSM failure notification."
  exit 0
fi

log "DOCKER_VERSION: $(docker --version 2>/dev/null || printf 'unavailable')"

if [ -f "$RUNTIME_DIR/docker-compose.yml" ]; then
  if compose -f "$RUNTIME_DIR/docker-compose.yml" --env-file "$RUNTIME_DIR/.env" config >/dev/null 2>&1; then
    log "COMPOSE_CONFIG: ok"
  else
    log "COMPOSE_CONFIG: failed"
  fi
else
  log "WARNING: docker-compose.yml is missing from $RUNTIME_DIR."
fi

container_present="false"
if docker ps -a --format '{{.Names}}' | grep -x "$CONTAINER_NAME" >/dev/null 2>&1; then
  container_present="true"
fi
log "CONTAINER_PRESENT: $container_present"

if [ "$container_present" = "true" ]; then
  running=$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  status=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  oom_killed=$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  restart_count=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  started_at=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  finished_at=$(docker inspect -f '{{.State.FinishedAt}}' "$CONTAINER_NAME" 2>/dev/null || printf 'unknown')
  log "CONTAINER_STATE: running=$running status=$status exitCode=$exit_code oomKilled=$oom_killed health=$health restartCount=$restart_count"
  if [ "$status" = "restarting" ]; then
    log "DIAGNOSIS: Container is in a Docker restart loop."
  fi
  if [ "$exit_code" = "127" ]; then
    log "DIAGNOSIS: exitCode=127 usually means a command was not found inside the container, commonly missing npm/next or broken node_modules."
  fi
  log "CONTAINER_TIMES: startedAt=$started_at finishedAt=$finished_at"
  log "RECENT_DOCKER_LOGS_BEGIN: tail=$LOG_TAIL"
  docker logs --tail "$LOG_TAIL" "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do
    log "DOCKER_LOG: $line"
  done
  log "RECENT_DOCKER_LOGS_END"
fi

if command -v curl >/dev/null 2>&1; then
  http_status=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${host_port}/" 2>/dev/null || printf 'curl-failed')
  log "LOCAL_HTTP_STATUS: http://127.0.0.1:${host_port}/ -> $http_status"
else
  log "LOCAL_HTTP_STATUS: curl unavailable"
fi

log "Status report completed. Log file: $LOG_FILE"
exit 0
