#!/bin/sh
set -u

TARGET_DIR="${TARGET_DIR:-/volume1/docker/research-briefing-platform}"
SOURCE_DIR="${SOURCE_DIR:-/volume1/docker/sci-experiment}"
LOG_DIR="${LOG_DIR:-$TARGET_DIR/.logs}"
LOG_FILE="$LOG_DIR/briefing-generate-$(date +%Y%m%d).log"

add_node_paths() {
  if [ -n "${NODE_BIN_DIR:-}" ] && [ -d "$NODE_BIN_DIR" ]; then
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
  code="${2:-1}"
  log "ERROR: $1"
  log "Log file: $LOG_FILE"
  if [ -f "$LOG_FILE" ]; then
    log "---- last 80 log lines ----"
    tail -80 "$LOG_FILE"
  fi
  exit "$code"
}

run() {
  log "+ $*"
  "$@" >> "$LOG_FILE" 2>&1
  status=$?
  if [ "$status" -ne 0 ]; then
    die "command failed with exit $status: $*" "$status"
  fi
}

env_flags() {
  for key in \
    REPORT_STORAGE_BACKEND \
    REPORT_STORAGE_LOCAL_PATH \
    GOOGLE_DRIVE_CLIENT_ID \
    GOOGLE_DRIVE_CLIENT_SECRET \
    GOOGLE_DRIVE_REFRESH_TOKEN \
    GOOGLE_DRIVE_FOLDER_ID \
    GOOGLE_DRIVE_FOLDER_URL \
    GOOGLE_DRIVE_DATABASE_FILE_ID \
    GOOGLE_DRIVE_DATABASE_FILENAME \
    GOOGLE_DRIVE_LOCAL_MIRROR_PATH \
    NCBI_EMAIL \
    NCBI_TOOL \
    NCBI_API_KEY \
    OPENAI_API_KEY \
    OPENAI_MODEL \
    BRIEFING_DAYS_BACK \
    APP_BASE_URL \
    RUNNER_FILE
  do
    printf -- "--env %s " "$key"
  done
}

resolve_runner_file() {
  if [ -f "$APP_DIR/src/lib/synology-briefing-runner.ts" ]; then
    RUNNER_FILE="src/lib/synology-briefing-runner.ts"
    export RUNNER_FILE
    return 0
  fi

  if [ -f "$APP_DIR/scripts/synology-briefing-runner.ts" ]; then
    RUNNER_FILE="scripts/synology-briefing-runner.ts"
    export RUNNER_FILE
    return 0
  fi

  die "Synology runner not found. Expected src/lib/synology-briefing-runner.ts or scripts/synology-briefing-runner.ts."
}

run_with_docker_node() {
  command -v docker >/dev/null 2>&1 || die "Host Node.js is below 20 and docker was not found. Install Synology Node.js 20+ or Container Manager/Docker."

  user_flag=""
  if command -v id >/dev/null 2>&1; then
    user_flag="--user $(id -u):$(id -g)"
  fi

  log "Host Node.js is below 20. Running briefing inside Docker image node:24-bookworm-slim."
  # shellcheck disable=SC2086
  run docker run --rm \
    --name research-briefing-generate \
    $user_flag \
    -v "$APP_DIR:/app" \
    -w /app \
    --env HOME=/tmp \
    --env npm_config_cache=/tmp/.npm \
    $(env_flags) \
    node:24-bookworm-slim \
    sh -lc 'node -v && npm -v && if [ ! -d node_modules ]; then if [ -f package-lock.json ]; then npm ci; else npm install; fi; fi && npx tsx "$RUNNER_FILE"'
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

resolve_app_dir() {
  for candidate in \
    "${APP_DIR:-}" \
    "$TARGET_DIR" \
    "$TARGET_DIR/app" \
    "$SOURCE_DIR" \
    "$SOURCE_DIR/app"
  do
    if [ -n "$candidate" ] && [ -f "$candidate/package.json" ]; then
      APP_DIR="$candidate"
      export APP_DIR
      return 0
    fi
  done

  die "package.json not found. Checked: APP_DIR, $TARGET_DIR, $TARGET_DIR/app, $SOURCE_DIR, $SOURCE_DIR/app"
}

prepare_target_folder() {
  if [ "$APP_DIR" = "$SOURCE_DIR" ] && [ ! -f "$TARGET_DIR/package.json" ]; then
    log "Target folder has no package.json. Moving sci-experiment into research-briefing-platform."
    stamp=$(date +%Y%m%d-%H%M%S)
    mkdir -p "$(dirname "$TARGET_DIR")"
    if [ -d "$TARGET_DIR" ]; then
      mv "$TARGET_DIR" "$TARGET_DIR.empty-$stamp"
    fi
    mv "$SOURCE_DIR" "$TARGET_DIR"
    APP_DIR="$TARGET_DIR"
    export APP_DIR
    LOG_DIR="$APP_DIR/.logs"
    LOG_FILE="$LOG_DIR/briefing-generate-$(date +%Y%m%d).log"
    mkdir -p "$LOG_DIR"
  fi

  mkdir -p "$APP_DIR/scripts" "$APP_DIR/.logs"
}

main() {
  add_node_paths
  resolve_app_dir
  prepare_target_folder

  log "[$(date '+%Y-%m-%d %H:%M:%S')] Synology briefing run started"
  log "APP_DIR=$APP_DIR"
  log "PATH=$PATH"

  cd "$APP_DIR" || die "cannot cd into APP_DIR=$APP_DIR"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
  resolve_runner_file

  node_major=0
  if command -v node >/dev/null 2>&1; then
    node_major=$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf "0")
  fi
  log "node=$(node -v 2>/dev/null || true)"
  log "npm=$(npm -v 2>/dev/null || true)"
  if [ "$node_major" -lt 20 ]; then
    run_with_docker_node
    log "[$(date '+%Y-%m-%d %H:%M:%S')] Synology briefing run finished"
    return 0
  fi

  command -v npm >/dev/null 2>&1 || die "npm was not found. Install Synology Node.js 20+ package or set NODE_BIN_DIR."

  if [ ! -d "$APP_DIR/node_modules" ]; then
    if [ -f "$APP_DIR/package-lock.json" ]; then
      run npm ci
    else
      run npm install
    fi
  fi

  export REPORT_STORAGE_BACKEND="${REPORT_STORAGE_BACKEND:-local-json}"
  export REPORT_STORAGE_LOCAL_PATH="${REPORT_STORAGE_LOCAL_PATH:-.data/research-briefing-storage.json}"
  export NCBI_TOOL="${NCBI_TOOL:-research-briefing-platform}"
  export BRIEFING_DAYS_BACK="${BRIEFING_DAYS_BACK:-7}"

  run npx tsx "$RUNNER_FILE"
  log "[$(date '+%Y-%m-%d %H:%M:%S')] Synology briefing run finished"
}

main "$@"
