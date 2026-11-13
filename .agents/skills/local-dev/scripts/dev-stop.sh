#!/usr/bin/env bash
# Stop a `pnpm dev` started by dev-start.sh, including its workerd processes,
# and the local feed server.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

pid_file=.alchemy/dev.pid
ports_busy() {
  curl -s -o /dev/null -m 2 http://localhost:5173/ ||
    curl -s -o /dev/null -m 2 http://localhost:5174/ ||
    curl -s -o /dev/null -m 2 http://localhost:5175/status/200
}

if [ -f "$pid_file" ]; then
  pid=$(cat "$pid_file")
  # The same signal as Ctrl-C, sent to the whole process group.
  kill -INT -- "-$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 -- "-$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 -- "-$pid" 2>/dev/null; then
    echo "pnpm dev did not exit after SIGINT; sending SIGTERM." >&2
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 2
  fi
  rm -f "$pid_file"
fi

feeds_pid_file=.alchemy/feeds.pid
if [ -f "$feeds_pid_file" ]; then
  kill "$(cat "$feeds_pid_file")" 2>/dev/null || true
  rm -f "$feeds_pid_file"
fi

if ports_busy; then
  echo "Something is still listening on :5173, :5174 or :5175 (a pnpm dev not started by dev-start.sh?)." >&2
  exit 1
fi
echo "pnpm dev and the feed server stopped; ports 5173-5175 are free."
