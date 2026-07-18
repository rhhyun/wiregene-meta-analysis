#!/bin/sh
set -eu

echo "ERROR: The legacy foreground/source-build web launcher is disabled." >&2
echo "Use the owning site repository's bounded image deployment task." >&2
exit 64
