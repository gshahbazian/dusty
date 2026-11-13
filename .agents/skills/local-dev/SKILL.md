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
.agents/skills/local-dev/scripts/setup.sh
```

Checks Node 24+ and pnpm, installs dependencies, writes a dev `.env` if
there is none, and installs the Playwright browser.

- If it says Node 24+ is required, look for a Node 24 that is installed but
  not first on `PATH` (cloud sandboxes often have one, e.g. `/opt/node24/bin`)
  and put it first: `export PATH=/opt/node24/bin:$PATH`.
- If the Playwright download is blocked (a sandbox whose network denies
  `cdn.playwright.dev`), point `DUSTY_CHROMIUM_PATH` at a Chromium that is
  already installed and re-run; `pnpm test:e2e` then launches that one.
  Cloud sandboxes usually have one at `/opt/pw-browsers/chromium`. It can be
  a few versions older than the one Playwright pins; that is fine for these
  tests.

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

```sh
.agents/skills/local-dev/scripts/dev-start.sh   # returns once :5173 answers 200
.agents/skills/local-dev/scripts/dev-stop.sh    # stops it and checks the ports are free
```

Logs go to `.alchemy/dev.log`. They contain NUL bytes (Vite's virtual
module IDs), so search them with `grep -a`, or grep calls the file binary.
Hot reloads show up there as `[Web] hmr update ...` and
`[Sync] Updated in ...ms`. Migrations are applied silently; check them with
`db.sh "select * from __alchemy_migrations"`.

Don't start it with a bare `pnpm dev > log &` from a script: `.alchemy/`
does not exist on a fresh checkout, and a background job without job
control ignores SIGINT, so it is hard to stop cleanly.

## Useful scripts

| Script                                                       | Does                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `.agents/skills/local-dev/scripts/db.sh "select * from sync_state"` | Query the local D1 database with Node's built-in SQLite (no argument: interactive shell, needs the `sqlite3` CLI) |
| `.agents/skills/local-dev/scripts/trigger-cron.sh`                  | Fire the scheduled sync now                                  |
| `.agents/skills/local-dev/scripts/reset.sh`                         | Delete all local state (stop `pnpm dev` first)               |

## Tests

- `pnpm test`: unit and integration tests (Vitest). DB tests use a real
  local D1 through Miniflare (`createTestD1` in `@dusty/db/testing`), so
  they do not need `pnpm dev`.
- `pnpm test:e2e`: Playwright against the running stack. Start
  `pnpm dev` first. It loads the page as the owner and expects the
  background sync request to return 200; afterwards `db.sh "select * from
  sync_state"` shows `last_trigger = on_load`.

## Changing the database schema

1. Edit `packages/db/src/schema.ts`.
2. `pnpm --filter @dusty/db generate` writes a new migration folder.
3. Commit both. `pnpm dev` applies it on the next start.

Never edit a migration that has been deployed; add a new one.
