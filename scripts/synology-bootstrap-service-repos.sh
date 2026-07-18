#!/bin/sh
set -eu

echo "ERROR: Cross-site repository bootstrap is disabled in the Meta deployment." >&2
echo "Manage each site checkout and scheduler task independently." >&2
exit 64
