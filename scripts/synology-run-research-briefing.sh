#!/bin/sh
set -eu

echo "ERROR: Research briefing is a separate bounded batch task." >&2
echo "Run it only from /volume1/docker/research-briefing-platform after its own audit." >&2
exit 64
