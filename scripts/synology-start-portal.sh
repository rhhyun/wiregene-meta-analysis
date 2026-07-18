#!/bin/sh
set -eu

echo "ERROR: Portal deployment is owned by /volume1/docker/wiregene-portal." >&2
echo "This legacy Meta-repository entrypoint is disabled and made no changes." >&2
exit 64
