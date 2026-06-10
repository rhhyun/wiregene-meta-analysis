#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
LOG_DIR="${LOG_DIR:-$APP_DIR/.logs}"
LOG_FILE="$LOG_DIR/web-start.log"
PID_FILE="$LOG_DIR/web.pid"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
PORT="${PORT:-3000}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
CONTAINER_NAME="${CONTAINER_NAME:-research-briefing-web}"
DOCKER_IMAGE="${DOCKER_IMAGE:-node:24-bookworm-slim}"
START_MODE="${START_MODE:-auto}"
AUTO_PORT="${AUTO_PORT:-true}"
RUN_AS_HOST_USER="${RUN_AS_HOST_USER:-false}"

# Optional for Synology installations where node/npm are not on the default PATH.
# Example:
#   export NODE_BIN_DIR=/var/packages/Node.js_v20/target/usr/local/bin
NODE_BIN_DIR="${NODE_BIN_DIR:-}"

add_node_paths() {
  if [ -n "$NODE_BIN_DIR" ] && [ -d "$NODE_BIN_DIR" ]; then
    PATH="$NODE_BIN_DIR:$PATH"
  fi

  for node_dir in \
    /var/packages/Node.js_v24/target/usr/local/bin \
    /var/packages/Node.js_v22/target/usr/local/bin \
    /var/packages/Node.js_v20/target/usr/local/bin \
    /var/packages/Node.js_v18/target/usr/local/bin \
    /volume1/@appstore/Node.js_v24/usr/local/bin \
    /volume1/@appstore/Node.js_v22/usr/local/bin \
    /volume1/@appstore/Node.js_v20/usr/local/bin \
    /volume1/@appstore/Node.js_v18/usr/local/bin
  do
    if [ -d "$node_dir" ]; then
      PATH="$node_dir:$PATH"
    fi
  done

  PATH="/usr/local/bin:/opt/bin:/usr/bin:/bin:$PATH"
  export PATH
}

log() {
  mkdir -p "$LOG_DIR"
  printf "%s\n" "$*" | tee -a "$LOG_FILE"
}

die() {
  log "ERROR: $1"
  log "Log file: $LOG_FILE"
  exit "${2:-1}"
}

run() {
  log "+ $*"
  "$@" >> "$LOG_FILE" 2>&1
}

load_env_file() {
  env_file="$1"
  [ -f "$env_file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "" | \#*) continue ;;
      export\ *) line=${line#export } ;;
    esac

    case "$line" in
      *=*) ;;
      *) continue ;;
    esac

    key=${line%%=*}
    value=${line#*=}
    key=$(printf "%s" "$key" | tr -d "[:space:]")
    value=$(printf "%s" "$value" | sed 's/\r$//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')

    case "$key" in
      "" | *[!A-Za-z0-9_]* ) continue ;;
    esac

    export "$key=$value"
  done < "$env_file"
}

node_major() {
  if command -v node >/dev/null 2>&1; then
    node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf "0"
  else
    printf "0"
  fi
}

docker_container_exists() {
  command -v docker >/dev/null 2>&1 || return 1
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Fx "$1" >/dev/null 2>&1
}

docker_owner_for_port() {
  command -v docker >/dev/null 2>&1 || return 1
  docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | awk -v port="$1" '
    index($0, ":" port "->") || index($0, "0.0.0.0:" port) || index($0, ":::" port) {
      print $1
      exit
    }
  '
}

host_port_in_use() {
  check_port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v port=":$check_port" '$4 ~ port "$" { found = 1 } END { exit found ? 0 : 1 }'
    return $?
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | awk -v port=":$check_port" '$0 ~ port && $0 ~ /LISTEN/ { found = 1 } END { exit found ? 0 : 1 }'
    return $?
  fi

  return 1
}

resolve_port() {
  requested_port="$PORT"
  candidate_port="$requested_port"
  attempts=0

  while [ "$attempts" -lt 20 ]; do
    owner=$(docker_owner_for_port "$candidate_port" || true)
    if [ "$owner" = "$CONTAINER_NAME" ]; then
      log "Removing existing Docker container $CONTAINER_NAME that was using port $candidate_port."
      docker rm -f "$CONTAINER_NAME" >> "$LOG_FILE" 2>&1 || true
      owner=""
    fi

    if [ -z "$owner" ] && ! host_port_in_use "$candidate_port"; then
      PORT="$candidate_port"
      export PORT
      if [ "$PORT" != "$requested_port" ]; then
        log "Port $requested_port is busy. Using available port $PORT instead."
      fi
      return 0
    fi

    if [ "$AUTO_PORT" != "true" ]; then
      log "Port $candidate_port is already in use."
      if [ -n "$owner" ]; then
        log "Docker container using it: $owner"
      fi
      die "Free port $candidate_port or run with PORT=3001."
    fi

    if [ -n "$owner" ]; then
      log "Port $candidate_port is used by Docker container $owner. Trying next port."
    else
      log "Port $candidate_port is already in use on the host. Trying next port."
    fi
    candidate_port=$((candidate_port + 1))
    attempts=$((attempts + 1))
  done

  die "Could not find a free port from $requested_port to $candidate_port."
}

env_flags() {
  for key in \
    ALLOW_PUBLIC_RUN \
    APP_BASIC_AUTH_USER \
    APP_BASIC_AUTH_PASSWORD \
    APP_ADMIN_USERS \
    WIREGENE_ADMIN_EMAILS \
    WIREGENE_APP_MODE \
    APP_BASE_URL \
    CRON_SECRET \
    REPORT_STORAGE_BACKEND \
    REPORT_STORAGE_LOCAL_PATH \
    GOOGLE_DRIVE_CLIENT_ID \
    GOOGLE_DRIVE_CLIENT_SECRET \
    GOOGLE_DRIVE_REFRESH_TOKEN \
    GOOGLE_DRIVE_FOLDER_ID \
    GOOGLE_DRIVE_FOLDER_URL \
    GOOGLE_DRIVE_FOLDER_NAME \
    GOOGLE_DRIVE_DATABASE_FILE_ID \
    GOOGLE_DRIVE_DATABASE_FILENAME \
    GOOGLE_DRIVE_LOCAL_MIRROR_PATH \
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON \
    PORTAL_ACCOUNT_STORAGE_PATH \
    NCBI_EMAIL \
    NCBI_TOOL \
    NCBI_API_KEY \
    SCOPUS_API_KEY \
    WEB_OF_SCIENCE_API_KEY \
    EMBASE_API_KEY \
    COCHRANE_API_KEY \
    OPENAI_API_KEY \
    OPENAI_MODEL \
    ZOTERO_API_KEY \
    ZOTERO_LIBRARY_TYPE \
    ZOTERO_LIBRARY_ID \
    ZOTERO_COLLECTION_KEY \
    ZOTERO_ROOT_COLLECTION_NAME \
    ZOTERO_AUTO_CREATE_COLLECTIONS \
    ZOTERO_TOPIC_COLLECTION_MAP_JSON \
    GRANT_CANDIDATE_STORAGE_PATH \
    GRANT_EXCLUSION_STORAGE_PATH \
    GRANT_KEYWORD_PRESET_STORAGE_PATH
  do
    printf -- "--env %s " "$key"
  done
}

prepare_app() {
  [ -f "$APP_DIR/package.json" ] || die "package.json not found in APP_DIR=$APP_DIR"
  mkdir -p "$LOG_DIR" "$APP_DIR/.data"
  chmod 775 "$LOG_DIR" "$APP_DIR/.data" 2>/dev/null || true
  cd "$APP_DIR" || die "cannot cd into APP_DIR=$APP_DIR"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
}

start_with_host_node() {
  resolve_port

  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    log "Research briefing web server is already running. PID=$(cat "$PID_FILE")"
    exit 0
  fi

  log "Starting with host Node.js on port $PORT."
  if [ ! -d "$APP_DIR/node_modules" ]; then
    if [ -f "$APP_DIR/package-lock.json" ]; then
      run npm ci
    else
      run npm install
    fi
  fi

  run npm run build

  nohup npm run start -- --hostname "$HOSTNAME" --port "$PORT" >> "$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
  log "Research briefing web server started. PID=$(cat "$PID_FILE") URL=http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
}

start_with_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker was not found. Install/enable Synology Container Manager or install Node.js 20+."

  if docker_container_exists "$CONTAINER_NAME"; then
    log "Removing existing Docker container $CONTAINER_NAME before restart."
    docker rm -f "$CONTAINER_NAME" >> "$LOG_FILE" 2>&1 || true
  fi

  resolve_port

  user_flag=""
  if [ "$RUN_AS_HOST_USER" = "true" ] && command -v id >/dev/null 2>&1; then
    user_flag="--user $(id -u):$(id -g)"
  fi

  log "Starting Docker container $CONTAINER_NAME on host port $PORT. RUN_AS_HOST_USER=$RUN_AS_HOST_USER"
  # shellcheck disable=SC2086
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    $user_flag \
    -p "$PORT:$CONTAINER_PORT" \
    -v "$APP_DIR:/app" \
    -w /app \
    --env HOME=/tmp \
    --env npm_config_cache=/tmp/.npm \
    --env NODE_ENV=production \
    --env CONTAINER_PORT="$CONTAINER_PORT" \
    $(env_flags) \
    "$DOCKER_IMAGE" \
    sh -lc 'set -eu; node -v; npm -v; if [ ! -d node_modules ]; then if [ -f package-lock.json ]; then npm ci; else npm install; fi; fi; npm run build; npm run start -- --hostname 0.0.0.0 --port "$CONTAINER_PORT"' \
    >> "$LOG_FILE" 2>&1

  sleep 3
  if ! docker ps --format '{{.Names}}' | grep -Fx "$CONTAINER_NAME" >/dev/null 2>&1; then
    log "Docker container $CONTAINER_NAME exited during startup."
    docker logs "$CONTAINER_NAME" >> "$LOG_FILE" 2>&1 || true
    die "Web container failed to stay running. Check $LOG_FILE and docker logs $CONTAINER_NAME."
  fi

  log "Research briefing Docker web started. Container=$CONTAINER_NAME URL=http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
  log "Logs: docker logs -f $CONTAINER_NAME"
}

main() {
  add_node_paths
  prepare_app
  log "[$(date '+%Y-%m-%d %H:%M:%S')] Research briefing web server start requested"
  log "APP_DIR=$APP_DIR HOSTNAME=$HOSTNAME PORT=$PORT START_MODE=$START_MODE RUN_AS_HOST_USER=$RUN_AS_HOST_USER"
  log "node=$(node -v 2>/dev/null || true)"
  log "npm=$(npm -v 2>/dev/null || true)"

  major=$(node_major)
  case "$START_MODE" in
    docker)
      start_with_docker
      ;;
    host)
      [ "$major" -ge 20 ] || die "Node.js 20+ is required for host mode. Current node=$(node -v 2>/dev/null || echo missing)"
      start_with_host_node
      ;;
    auto)
      if [ "$major" -ge 20 ]; then
        start_with_host_node
      else
        log "Host Node.js is below 20. Using Docker image $DOCKER_IMAGE."
        start_with_docker
      fi
      ;;
    *)
      die "Invalid START_MODE=$START_MODE. Use auto, host, or docker."
      ;;
  esac
}

main "$@"
