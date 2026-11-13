#!/usr/bin/env bash
# Start `pnpm dev` in the background and wait until the web app answers.
# Also starts the local feed server (fixture feeds on :5175) so syncs have
# something to fetch. Logs go to .alchemy/dev.log and .alchemy/feeds.log;
# stop both with dev-stop.sh.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

pid_file=.alchemy/dev.pid
log=.alchemy/dev.log
url=http://localhost:5173/

mkdir -p .alchemy

feeds_pid_file=.alchemy/feeds.pid
if ! { [ -f "$feeds_pid_file" ] && kill -0 "$(cat "$feeds_pid_file")" 2>/dev/null; }; then
  node .agents/skills/local-dev/scripts/feed-server.mjs > .alchemy/feeds.log 2>&1 &
  echo $! > "$feeds_pid_file"
fi

if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  echo "pnpm dev is already running (pid $(cat "$pid_file")); logs in $log."
  exit 0
fi
# Job control gives the background job its own process group (so dev-stop.sh
# can signal everything it starts) and keeps SIGINT working for it.
set -m
pnpm dev > "$log" 2>&1 &
echo $! > "$pid_file"
set +m

for _ in $(seq 1 90); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = 200 ]; then
    echo "pnpm dev is up at $url (pid $(cat "$pid_file")); logs in $log."
    exit 0
  fi
  if ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "pnpm dev exited during startup. Last lines of $log:" >&2
    tail -n 30 "$log" >&2
    exit 1
  fi
  sleep 2
done

echo "pnpm dev did not answer at $url within 3 minutes. Last lines of $log:" >&2
tail -n 30 "$log" >&2
exit 1
