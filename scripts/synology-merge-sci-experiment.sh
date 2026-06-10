#!/bin/sh
set -eu

SOURCE_DIR="${SOURCE_DIR:-/volume1/docker/sci-experiment}"
TARGET_DIR="${TARGET_DIR:-/volume1/docker/research-briefing-platform}"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="${LOG_DIR:-$TARGET_DIR/.logs}"
LOG_FILE="$LOG_DIR/merge-sci-experiment-$STAMP.log"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

write_file_if_missing() {
  path="$1"
  mode="$2"
  content="$3"

  if [ -f "$path" ]; then
    echo "keep existing file: $path"
    chmod "$mode" "$path" || true
    return 0
  fi

  mkdir -p "$(dirname "$path")"
  printf "%s\n" "$content" > "$path"
  chmod "$mode" "$path"
  echo "created file: $path"
}

[ -d "$SOURCE_DIR" ] || fail "source folder not found: $SOURCE_DIR"
mkdir -p "$TARGET_DIR"
[ "$(cd "$SOURCE_DIR" && pwd)" != "$(cd "$TARGET_DIR" && pwd)" ] || fail "source and target are the same folder"

mkdir -p "$LOG_DIR"

{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] merge started"
  echo "SOURCE_DIR=$SOURCE_DIR"
  echo "TARGET_DIR=$TARGET_DIR"
  echo
  echo "== source top-level =="
  find "$SOURCE_DIR" -maxdepth 2 -mindepth 1 -print | sort
  echo
  echo "== target top-level before =="
  find "$TARGET_DIR" -maxdepth 2 -mindepth 1 -print | sort
  echo

  if command -v rsync >/dev/null 2>&1; then
    echo "== copying missing files with rsync --ignore-existing =="
    rsync -a --ignore-existing \
      --exclude ".git/" \
      --exclude ".next/" \
      --exclude "node_modules/" \
      --exclude ".turbo/" \
      --exclude ".vercel/" \
      --exclude ".logs/" \
      "$SOURCE_DIR"/ "$TARGET_DIR"/
  else
    echo "== rsync not found; copying missing files with tar fallback =="
    tmp_dir="$TARGET_DIR/.merge-tmp-$STAMP"
    mkdir -p "$tmp_dir"
    (
      cd "$SOURCE_DIR"
      tar \
        --exclude="./.git" \
        --exclude="./.next" \
        --exclude="./node_modules" \
        --exclude="./.turbo" \
        --exclude="./.vercel" \
        --exclude="./.logs" \
        -cf - .
    ) | (
      cd "$tmp_dir"
      tar -xf -
    )
    (
      cd "$tmp_dir"
      find . -type d -print | while IFS= read -r dir; do
        mkdir -p "$TARGET_DIR/$dir"
      done
      find . -type f -print | while IFS= read -r file; do
        if [ ! -e "$TARGET_DIR/$file" ]; then
          cp -p "$file" "$TARGET_DIR/$file"
          echo "copied missing file: $file"
        else
          echo "kept target file: $file"
        fi
      done
    )
    rm -rf "$tmp_dir"
  fi

  mkdir -p "$TARGET_DIR/scripts"

  write_file_if_missing "$TARGET_DIR/scripts/synology-briefing-generate.sh" 755 '#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
LOG_DIR="${LOG_DIR:-$APP_DIR/.logs}"
LOG_FILE="$LOG_DIR/briefing-generate-$(date +%Y%m%d).log"
NODE_BIN_DIR="${NODE_BIN_DIR:-}"
if [ -n "$NODE_BIN_DIR" ]; then
  PATH="$NODE_BIN_DIR:$PATH"
fi
PATH="/usr/local/bin:/opt/bin:/usr/bin:/bin:$PATH"
export PATH

load_env_file() {
  env_file="$1"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "" | \#*) continue ;; export\ *) line=${line#export } ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    key=$(printf "%s" "$key" | tr -d "[:space:]")
    value=$(printf "%s" "$value" | sed "s/\r$//; s/^\"//; s/\"$//; s/^'\''//; s/'\''$//")
    case "$key" in "" | *[!A-Za-z0-9_]* ) continue ;; esac
    export "$key=$value"
  done < "$env_file"
}

mkdir -p "$LOG_DIR"
{
  echo "[$(date "+%Y-%m-%d %H:%M:%S")] Research briefing scheduled run started"
  cd "$APP_DIR"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
  export REPORT_STORAGE_BACKEND="${REPORT_STORAGE_BACKEND:-google-drive}"
  export NCBI_TOOL="${NCBI_TOOL:-research-briefing-platform}"
  export BRIEFING_DAYS_BACK="${BRIEFING_DAYS_BACK:-7}"
  if [ ! -d "$APP_DIR/node_modules" ]; then npm ci; fi
  npm run briefing:generate
  echo "[$(date "+%Y-%m-%d %H:%M:%S")] Research briefing scheduled run finished"
} >> "$LOG_FILE" 2>&1'

  write_file_if_missing "$TARGET_DIR/scripts/synology-web-start.sh" 755 '#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
LOG_DIR="${LOG_DIR:-$APP_DIR/.logs}"
LOG_FILE="$LOG_DIR/web-start.log"
PID_FILE="$LOG_DIR/web.pid"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
PORT="${PORT:-3000}"
NODE_BIN_DIR="${NODE_BIN_DIR:-}"
if [ -n "$NODE_BIN_DIR" ]; then
  PATH="$NODE_BIN_DIR:$PATH"
fi
PATH="/usr/local/bin:/opt/bin:/usr/bin:/bin:$PATH"
export PATH

load_env_file() {
  env_file="$1"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "" | \#*) continue ;; export\ *) line=${line#export } ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    key=$(printf "%s" "$key" | tr -d "[:space:]")
    value=$(printf "%s" "$value" | sed "s/\r$//; s/^\"//; s/\"$//; s/^'\''//; s/'\''$//")
    case "$key" in "" | *[!A-Za-z0-9_]* ) continue ;; esac
    export "$key=$value"
  done < "$env_file"
}

mkdir -p "$LOG_DIR"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Research briefing web server is already running. PID=$(cat "$PID_FILE")"
  exit 0
fi
{
  echo "[$(date "+%Y-%m-%d %H:%M:%S")] Research briefing web server start requested"
  cd "$APP_DIR"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
  if [ ! -d "$APP_DIR/node_modules" ]; then npm ci; fi
  if [ ! -d "$APP_DIR/.next" ]; then npm run build; fi
} >> "$LOG_FILE" 2>&1
cd "$APP_DIR"
nohup npm run start -- --hostname "$HOSTNAME" --port "$PORT" >> "$LOG_FILE" 2>&1 &
echo "$!" > "$PID_FILE"
echo "Research briefing web server started. PID=$(cat "$PID_FILE")"'

  echo
  echo "== target top-level after =="
  find "$TARGET_DIR" -maxdepth 2 -mindepth 1 -print | sort
  echo
  echo "Merge completed without deleting source folder."
  echo "Review this log, then update Synology Task Scheduler to use:"
  echo "/bin/sh $TARGET_DIR/scripts/synology-briefing-generate.sh"
  echo "/bin/sh $TARGET_DIR/scripts/synology-web-start.sh"
  echo "Do not remove $SOURCE_DIR until the target app has run correctly."
} 2>&1 | tee "$LOG_FILE"
