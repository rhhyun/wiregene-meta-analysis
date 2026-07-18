#!/bin/sh
set -eu

echo "ERROR: The legacy cross-site merge/bootstrap script is disabled." >&2
echo "Use the owning service repository; no files or containers were changed." >&2
exit 64
