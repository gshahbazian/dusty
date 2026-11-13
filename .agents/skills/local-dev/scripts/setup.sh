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

pnpm exec playwright install chromium >/dev/null
echo "Setup done. Start the stack with: pnpm dev"
