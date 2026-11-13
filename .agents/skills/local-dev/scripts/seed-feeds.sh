#!/usr/bin/env bash
# Subscribe the local dev database to the local feed server's fixtures (and
# a few failure cases), so a dev sync has real work to do. Safe to re-run.
# Start `pnpm dev` (for the database) and feed-server.mjs first.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=.agents/skills/local-dev/scripts
base=http://localhost:5175

urls=(
  "$base/rss.xml"
  "$base/atom.xml"
  "$base/rdf.xml"
  "$base/feed.json"
  "$base/latin1.xml"
  "$base/hostile.xml"
  "$base/status/404"
  "$base/html"
)

values=""
for url in "${urls[@]}"; do
  values+="${values:+, }('$url', cast(unixepoch('subsec') * 1000 as integer))"
done

"$here/db.sh" "insert into feeds (url, created_at) values $values on conflict (url) do nothing"
"$here/db.sh" "select id, url from feeds order by id"
