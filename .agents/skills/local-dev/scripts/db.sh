#!/usr/bin/env bash
# Run SQL against the local D1 database used by `pnpm dev`.
#   .agents/skills/local-dev/scripts/db.sh "select * from sync_state"
#   .agents/skills/local-dev/scripts/db.sh            # interactive sqlite3 shell
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

dir=.alchemy/local/d1/cloudflare-runtime-D1DatabaseObject
db=""
for f in "$dir"/*.sqlite; do
  [ -e "$f" ] || continue
  [ "$(basename "$f")" = metadata.sqlite ] && continue
  if sqlite3 "$f" "select 1 from sqlite_master where name = '__alchemy_migrations'" | grep -q 1; then
    db="$f"
  fi
done

if [ -z "$db" ]; then
  echo "No local database yet. Start the stack once with: pnpm dev" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  exec sqlite3 -header -column "$db"
fi

sqlite3 -header -column "$db" "$@"
