#!/bin/sh
set -eu

SEARCH_DIR="${SEARCH_DIR:-/volume1/docker/research-briefing-platform}"
META_SOURCE_DIR="${META_SOURCE_DIR:-/volume1/docker/wiregene-meta-analysis}"
PORTAL_SOURCE_DIR="${PORTAL_SOURCE_DIR:-/volume1/docker/wiregene-portal}"

SEARCH_REPO_URL="${SEARCH_REPO_URL:-https://github.com/rhhyun/research-briefing-platform.git}"
META_REPO_URL="${META_REPO_URL:-https://github.com/rhhyun/wiregene-meta-analysis.git}"
PORTAL_REPO_URL="${PORTAL_REPO_URL:-https://github.com/rhhyun/wiregene-portal.git}"

ensure_repo() {
  name="$1"
  dir="$2"
  url="$3"

  if [ -d "$dir/.git" ]; then
    echo "Updating $name source at $dir"
    git -C "$dir" pull --ff-only origin main
    return
  fi

  if [ -e "$dir" ]; then
    echo "ERROR: $dir exists but is not a Git checkout."
    echo "Move it aside or set ${name}_SOURCE_DIR to the real checkout path."
    exit 1
  fi

  echo "Cloning $name source into $dir"
  git clone "$url" "$dir"
}

ensure_repo SEARCH "$SEARCH_DIR" "$SEARCH_REPO_URL"
ensure_repo META "$META_SOURCE_DIR" "$META_REPO_URL"
ensure_repo PORTAL "$PORTAL_SOURCE_DIR" "$PORTAL_REPO_URL"

echo "Service source checkouts are ready."
echo "Search: $SEARCH_DIR"
echo "Meta:   $META_SOURCE_DIR"
echo "Portal: $PORTAL_SOURCE_DIR"
