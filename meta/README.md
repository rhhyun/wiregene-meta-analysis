# Wiregene Meta

This folder defines the operating boundary for `meta.wiregene.com`.
The source code still lives in the shared Next.js app under `src/`.

## Purpose

- Dedicated runtime for meta-analysis and systematic review workflows.
- UI entry: `src/components/MetaAnalysisApp.tsx`
- Study workspace: `src/components/MetaStudyWorkspace.tsx`
- Meta-analysis tools: `src/components/MetaAnalysisPanel.tsx`
- API boundary: `src/app/api/meta-analysis/**`

## Runtime Mode

For the shared Vercel project, leave `WIREGENE_APP_MODE` empty. The app
detects `meta.wiregene.com` from the request host.

For a separate Docker or Vercel project, set:

```text
WIREGENE_APP_MODE=meta
APP_BASE_URL=https://meta.wiregene.com
WIREGENE_ADMIN_EMAILS=admin@example.com
```

Use `APP_BASIC_AUTH_USER`/`APP_BASIC_AUTH_PASSWORD` or
`APP_BASIC_AUTH_USERS` for the actual login secret. Do not commit the password.

## Deployment

Use the Synology Docker package in:

```text
synology/docker/meta
```

GitHub Actions builds the production image. Synology pulls that image and starts
it detached; it does not install dependencies or build the application on the
NAS. The full standard is in [`DEPLOYMENT.md`](../DEPLOYMENT.md).

DSM Task Scheduler boot-time command:

```text
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

Rollback and read-only verification:

```text
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

Keep the deploy task manual or boot-time. Portal, briefing, workers, queues, and
migrations use separate service tasks; they are not chained to Meta deploy.

## Boundary Rules

The shared proxy allows only these paths in meta mode:

```text
/
/api/auth/logout
/api/meta-analysis/*
```

Do not move shared API or component code into this folder unless the project is
converted into separate apps.
