#!/usr/bin/env bash
# Fire the sync service's scheduled (cron) handler now, against `pnpm dev`.
set -euo pipefail
curl -fsS "http://localhost:5174/cdn-cgi/handler/scheduled?cron=$(printf '%s' "${SYNC_CRON:-17 * * * *}" | sed 's/ /+/g')"
echo
