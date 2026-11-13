#!/usr/bin/env bash
# Run SQL against the local D1 database used by `pnpm dev`.
#   .agents/skills/local-dev/scripts/db.sh "select * from sync_state"
#   .agents/skills/local-dev/scripts/db.sh            # interactive sqlite3 shell
# Queries use Node's built-in SQLite, so only the interactive shell needs the
# sqlite3 CLI.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=.agents/skills/local-dev/scripts

# Is this the app's database (not Miniflare's metadata file)?
is_app_db() {
  node --disable-warning=ExperimentalWarning "$here/db.mjs" "$1" \
    "select name from sqlite_master where name = '__alchemy_migrations'" |
    grep -q __alchemy_migrations
}

# Old databases can linger (an earlier stack, a renamed database), so take
# the app database that was written most recently.
dir=.alchemy/local/d1/cloudflare-runtime-D1DatabaseObject
db=""
if [ -d "$dir" ]; then
  while IFS= read -r f; do
    [ "$(basename "$f")" = metadata.sqlite ] && continue
    if is_app_db "$f"; then
      db="$f"
      break
    fi
  done < <(ls -t "$dir"/*.sqlite 2>/dev/null)
fi

if [ -z "$db" ]; then
  echo "No local database yet. Start the stack once with: pnpm dev" >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  if ! command -v sqlite3 >/dev/null; then
    echo "The interactive shell needs the sqlite3 CLI; pass SQL as an argument instead." >&2
    exit 1
  fi
  exec sqlite3 -header -column "$db"
fi

node --disable-warning=ExperimentalWarning "$here/db.mjs" "$db" "$@"
