#!/usr/bin/env bash
# Throw away all local dev state (database, caches, local Alchemy state).
# Stop `pnpm dev` first. The next `pnpm dev` recreates everything and re-runs
# migrations.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
rm -rf .alchemy
echo "Local state removed."
