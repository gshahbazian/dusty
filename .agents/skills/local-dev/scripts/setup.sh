#!/usr/bin/env bash
# One-time (and safe to re-run) setup for local development.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 24 ]; then
  echo "Node 24+ is required (found $(node -v))." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null; then
  echo "pnpm is required: https://pnpm.io/installation" >&2
  exit 1
fi

pnpm install

if [ ! -f .env ]; then
  # Dev only needs an owner email; the localhost login stand-in uses it.
  printf 'OWNER_EMAIL=owner@example.com\n' > .env
  echo "Created .env for local dev (see .env.example for deploy settings)."
fi

# The browser for `pnpm test:e2e`. Where Playwright's download is blocked,
# DUSTY_CHROMIUM_PATH can name a Chromium that is already installed.
install_log=$(mktemp)
trap 'rm -f "$install_log"' EXIT
if ! pnpm exec playwright install chromium >/dev/null 2>"$install_log"; then
  if [ -n "${DUSTY_CHROMIUM_PATH:-}" ] && [ -x "$DUSTY_CHROMIUM_PATH" ]; then
    echo "Playwright could not download its Chromium; e2e tests will use DUSTY_CHROMIUM_PATH=$DUSTY_CHROMIUM_PATH."
  else
    echo "Playwright could not download its Chromium:" >&2
    grep -m 1 'Error' "$install_log" >&2 || tail -n 3 "$install_log" >&2
    echo "Fix the download, or set DUSTY_CHROMIUM_PATH to an installed Chromium and re-run." >&2
    exit 1
  fi
fi
echo "Setup done. Start the stack with: .agents/skills/local-dev/scripts/dev-start.sh (or pnpm dev)"
