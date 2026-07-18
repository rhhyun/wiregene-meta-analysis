#!/bin/sh
set -eu

echo "ERROR: Briefing jobs are owned by /volume1/docker/research-briefing-platform." >&2
echo "This legacy Meta-repository batch entrypoint is disabled and made no changes." >&2
exit 64
