#!/usr/bin/env bash
# Re-download the real feeds the local feed server serves at /real/<file>
# (and the sync tests read), from the list in sources.tsv: a few personal
# blogs in RSS, Atom and JSON Feed, each cut to its 10 newest articles.
# Run it to refresh them; commit the result.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
dir=apps/sync/test/fixtures/real

while IFS=$'\t' read -r file url; do
  [ -z "$file" ] && continue
  curl -fsSL -A 'Dusty/1.0 (personal RSS reader)' -o "$dir/$file" "$url"
  node .agents/skills/local-dev/scripts/trim-feed.mjs "$dir/$file" 10
  echo "$file: $(wc -c < "$dir/$file" | tr -d ' ') bytes"
done < "$dir/sources.tsv"
