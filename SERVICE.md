# Wiregene Meta

Standalone repository exported from `research-briefing-platform`.

## Service Boundary

- Host: https://meta.wiregene.com
- App mode: meta
- Synology source directory: /volume1/docker/wiregene-meta-analysis
- Runtime directory: /volume1/docker/meta

The source is intentionally copied rather than shared with `search.wiregene.com`
so deployments, Vercel aliases, Synology containers, and environment variables
cannot overwrite each other.

## First Commit

```powershell
git init
git add .
git commit -m "Initialize Wiregene Meta standalone app"
git branch -M main
git remote add origin https://github.com/rhhyun/wiregene-meta-analysis.git
git push -u origin main
```

Set `WIREGENE_APP_MODE=meta` in Vercel and Synology.

## Synology DSM Task Scheduler

Use the bootstrap command below when the NAS source checkout may be missing or
stale. It clones or pulls the GitHub repo first, then starts the Docker service.

```sh
/bin/sh -c 'set -eu; export PATH="/usr/local/bin:/usr/bin:/bin:/var/packages/Git/target/bin:/volume1/@appstore/Git/bin:$PATH"; SRC="/volume1/docker/wiregene-meta-analysis"; REPO="https://github.com/rhhyun/wiregene-meta-analysis.git"; command -v git >/dev/null 2>&1 || { echo "git command not found. Install Synology Git package, then rerun."; exit 1; }; mkdir -p /volume1/docker; if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only origin main; elif [ -e "$SRC" ]; then echo "$SRC exists but is not a git checkout. Move it aside or clone the repo there."; exit 1; else git clone "$REPO" "$SRC"; fi; /bin/sh "$SRC/scripts/synology-start-meta.sh"'
```

If the start script reports missing Basic Auth values, first pull the latest
scripts, then choose one:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

```sh
APP_BASIC_AUTH_USER='YOUR_LOGIN_ID' APP_BASIC_AUTH_PASSWORD='YOUR_PASSWORD' WIREGENE_ADMIN_EMAILS='YOUR_ADMIN_EMAIL' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

For full-text article screening/extraction accuracy, configure OpenAI:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && OPENAI_API_KEY='YOUR_OPENAI_API_KEY' OPENAI_MODEL='gpt-5-nano' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Without `OPENAI_API_KEY`, the full-text assistant uses fallback rules and the
result is marked `aiUsed=false`.
