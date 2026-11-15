#!/usr/bin/env bash
# Fill an empty local dev stack with real articles: subscribe the dev
# database to the saved real feeds served by the local feed server (and two
# failure cases, so Settings shows unhealthy feeds), then sync them in.
# The dev stack itself starts empty; run this when you want data. Safe to
# re-run. Start the stack first (dev-start.sh, which also runs the feed
# server).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=.agents/skills/local-dev/scripts
base=http://localhost:5175

# Real feeds (saved copies of a few personal blogs, see
# apps/sync/test/fixtures/real/sources.tsv), plus two that fail, so
# Settings shows what an unhealthy feed looks like.
urls=()
while IFS=$'\t' read -r file _; do
  [ -n "$file" ] && urls+=("$base/real/$file")
done < apps/sync/test/fixtures/real/sources.tsv
urls+=("$base/status/404" "$base/html")

values=""
for url in "${urls[@]}"; do
  values+="${values:+, }('$url', cast(unixepoch('subsec') * 1000 as integer))"
done

"$here/db.sh" "insert into feeds (url, created_at) values $values on conflict (url) do nothing"
"$here/db.sh" "select id, url from feeds order by id"

# Sync them in now (the scheduled trigger ignores the skip window).
"$here/trigger-cron.sh"
"$here/db.sh" "select coalesce(f.title, f.url) as feed, f.last_outcome, count(a.id) as articles from feeds f left join articles a on a.feed_id = f.id group by f.id"
