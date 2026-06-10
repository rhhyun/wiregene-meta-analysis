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
git remote add origin https://github.com/rhhyun/empty.git
git push -u origin main
```

Set `WIREGENE_APP_MODE=meta` in Vercel and Synology.
