#!/bin/sh
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
status=0

/bin/sh "$SCRIPT_DIR/synology-start-meta.sh" || status=$?
/bin/sh "$SCRIPT_DIR/synology-start-portal.sh" || status=$?

exit "$status"
