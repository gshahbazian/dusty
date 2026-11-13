---
name: local-dev
description: Run Dusty locally (web app, sync service and D1) with no Cloudflare account, query the local database, fire the cron sync, and run the browser tests. Use before changing behaviour you need to see working, or when asked to run, start, test or debug the app locally.
---

# Local development

`pnpm dev` runs `alchemy dev`: both Workers in workerd (the production
runtime) and D1 as a local SQLite file. No Cloudflare account or login is
needed. Login is a stand-in that treats every request to `localhost` as
the owner (`AUTH_MODE=dev`); requests to any other host are refused.

## First time

```sh
.skills/local-dev/scripts/setup.sh
```

Checks Node 24+ and pnpm, installs dependencies, writes a dev `.env` if
there is none, and installs the Playwright browser.

## Run the stack

```sh
pnpm dev
```

| What                                            | Where                    |
| ----------------------------------------------- | ------------------------ |
| Web app (open this)                             | http://localhost:5173    |
| Sync service (dev only; deployed it has no URL) | http://localhost:5174    |
| Local state, D1 data, logs                      | `.alchemy/` (gitignored) |

It hot reloads on file changes, including `alchemy.run.ts`. If a reload
fails, the error is printed and it retries on the next change. Migrations
in `packages/db/migrations` are applied on every start.

Run it in the background when you need to keep working:
`pnpm dev > .alchemy/dev.log 2>&1 &`, then wait until
`curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` prints `200`.

## Useful scripts

| Script                                                       | Does                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `.skills/local-dev/scripts/db.sh "select * from sync_state"` | Query the local D1 database (no argument: interactive shell) |
| `.skills/local-dev/scripts/trigger-cron.sh`                  | Fire the scheduled sync now                                  |
| `.skills/local-dev/scripts/reset.sh`                         | Delete all local state (stop `pnpm dev` first)               |

## Tests

- `pnpm test`: unit and integration tests (Vitest). DB tests use a real
  local D1 through Miniflare (`createTestD1` in `@dusty/db/testing`), so
  they do not need `pnpm dev`.
- `pnpm test:e2e`: Playwright against the running stack. Start
  `pnpm dev` first.

## Changing the database schema

1. Edit `packages/db/src/schema.ts`.
2. `pnpm --filter @dusty/db generate` writes a new migration folder.
3. Commit both. `pnpm dev` applies it on the next start.

Never edit a migration that has been deployed; add a new one.
