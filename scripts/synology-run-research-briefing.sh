#!/bin/sh
set -eu

TARGET_DIR="${TARGET_DIR:-/volume1/docker/research-briefing-platform}"
SOURCE_DIR="${SOURCE_DIR:-/volume1/docker/sci-experiment}"
LOG_ROOT="${LOG_ROOT:-/volume1/docker/research-briefing-platform/.logs}"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_ROOT/briefing-docker-$STAMP.log"
PACKAGE_LIST="/tmp/research-briefing-package-list.$$"

log() {
  mkdir -p "$LOG_ROOT"
  printf "%s\n" "$*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  log "Log file: $LOG_FILE"
  exit 1
}

find_app_dir() {
  : > "$PACKAGE_LIST"
  for root in "$TARGET_DIR" "$SOURCE_DIR"; do
    [ -d "$root" ] || continue
    find "$root" -maxdepth 6 -type f -name package.json 2>/dev/null >> "$PACKAGE_LIST" || true
  done

  APP_DIR=""
  while IFS= read -r package_file; do
    if grep -q '"briefing:generate"\|"research-briefing-platform"\|"next"' "$package_file"; then
      APP_DIR=$(dirname "$package_file")
      break
    fi
  done < "$PACKAGE_LIST"

  if [ -z "$APP_DIR" ]; then
    log "No valid app package.json found. package.json candidates:"
    cat "$PACKAGE_LIST" | tee -a "$LOG_FILE"
    rm -f "$PACKAGE_LIST"
    fail "Cannot run briefing because no Next/research-briefing package.json was found."
  fi

  rm -f "$PACKAGE_LIST"
  export APP_DIR
}

promote_sci_experiment_if_needed() {
  case "$APP_DIR" in
    "$SOURCE_DIR" | "$SOURCE_DIR"/*)
      if [ ! -f "$TARGET_DIR/package.json" ] && [ ! -f "$TARGET_DIR/app/package.json" ]; then
        log "Promoting $SOURCE_DIR into $TARGET_DIR because target has no package.json."
        suffix=${APP_DIR#"$SOURCE_DIR"}
        if [ -d "$TARGET_DIR" ]; then
          mv "$TARGET_DIR" "$TARGET_DIR.empty-$STAMP"
        fi
        mv "$SOURCE_DIR" "$TARGET_DIR"
        APP_DIR="$TARGET_DIR$suffix"
        export APP_DIR
      fi
      ;;
  esac
}

write_runner_if_missing() {
  mkdir -p "$APP_DIR/scripts" "$APP_DIR/.logs" "$APP_DIR/.data"

  if [ -f "$APP_DIR/src/lib/synology-briefing-runner.ts" ]; then
    RUNNER_FILE="src/lib/synology-briefing-runner.ts"
    export RUNNER_FILE
    return 0
  fi

  RUNNER_FILE="scripts/synology-briefing-runner.ts"
  export RUNNER_FILE
  if [ -f "$APP_DIR/$RUNNER_FILE" ]; then
    return 0
  fi

  cat > "$APP_DIR/$RUNNER_FILE" <<'TS'
import { loadEnvConfig } from "@next/env";
import { generateResearchReportWithStorage } from "../src/lib/report-generator";
import { getReportStorageAdapter } from "../src/lib/storage";
import { reportVersionLabel } from "../src/lib/version";
import type { ReportWithItems } from "../src/lib/types";

loadEnvConfig(process.cwd());
process.env.REPORT_STORAGE_BACKEND ||= "local-json";
process.env.REPORT_STORAGE_LOCAL_PATH ||= ".data/research-briefing-storage.json";
process.env.NCBI_TOOL ||= "research-briefing-platform";
process.env.BRIEFING_DAYS_BACK ||= "7";

const daysBack = Math.min(365, Math.max(1, Number(process.env.BRIEFING_DAYS_BACK) || 7));
const storage = getReportStorageAdapter();
await storage.ensure();
await storage.seedDefaultTopics();

const report = await generateResearchReportWithStorage(
  (candidate: ReportWithItems) => storage.saveReport(candidate, candidate.items),
  daysBack,
  () => storage.getEnabledTopics(),
);

console.log(JSON.stringify({
  ok: true,
  runner: "synology-docker",
  storage: process.env.REPORT_STORAGE_BACKEND,
  version: reportVersionLabel(report),
  reportId: report.id,
  generatedAt: report.generatedAt,
  itemCount: report.items.length
}, null, 2));
TS
}

run_briefing() {
  command -v docker >/dev/null 2>&1 || fail "docker command not found. Install/enable Synology Container Manager."

  log "APP_DIR=$APP_DIR"
  log "RUNNER_FILE=$RUNNER_FILE"
  log "LOG_FILE=$LOG_FILE"

  docker run --rm \
    -v "$APP_DIR:/app" \
    -w /app \
    -e HOME=/tmp \
    -e npm_config_cache=/tmp/.npm \
    -e RUNNER_FILE="$RUNNER_FILE" \
    -e REPORT_STORAGE_BACKEND="${REPORT_STORAGE_BACKEND:-local-json}" \
    -e REPORT_STORAGE_LOCAL_PATH="${REPORT_STORAGE_LOCAL_PATH:-.data/research-briefing-storage.json}" \
    -e NCBI_EMAIL="${NCBI_EMAIL:-}" \
    -e NCBI_API_KEY="${NCBI_API_KEY:-}" \
    -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
    -e OPENAI_MODEL="${OPENAI_MODEL:-}" \
    -e BRIEFING_DAYS_BACK="${BRIEFING_DAYS_BACK:-7}" \
    node:24-bookworm-slim \
    sh -lc 'set -eu; node -v; npm -v; test -f package.json; if [ ! -d node_modules ]; then if [ -f package-lock.json ]; then npm ci; else npm install; fi; fi; npx tsx "$RUNNER_FILE"' \
    2>&1 | tee -a "$LOG_FILE"
}

find_app_dir
promote_sci_experiment_if_needed
write_runner_if_missing
run_briefing
