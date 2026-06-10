# Synology Meta Service

This package runs `meta.wiregene.com` as a separate Synology Docker service.

## Install

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

On the first run, fill `/volume1/docker/meta/.env`, then run the same command
again.

The default service listens on host port `3001`.

## Required Source

The shared GitHub source should exist at:

```text
/volume1/docker/wiregene-meta-analysis
```

Change `APP_SOURCE_DIR` in `.env` if the checkout lives elsewhere.
