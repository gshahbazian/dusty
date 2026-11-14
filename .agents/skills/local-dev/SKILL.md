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
.agents/skills/local-dev/scripts/dev-start.sh   # returns once :5173 answers 200; also starts the feed server
.agents/skills/local-dev/scripts/dev-stop.sh    # stops both and checks ports 5173-5175 are free
```

Logs go to `.alchemy/dev.log`. They contain NUL bytes (Vite's virtual
module IDs), so search them with `grep -a`, or grep calls the file binary.
Hot reloads show up there as `[Web] hmr update ...` and
`[Sync] Updated in ...ms`. Migrations are applied silently; check them with
`db.sh "select * from __alchemy_migrations"`.

Both Workers open the same local D1 SQLite file from separate processes,
so one can find it locked by the other. The log then shows
`database is locked: SQLITE_BUSY` from `workerd/util/sqlite.c++`, while
JavaScript only sees `D1_ERROR: Failed to get session commit token:
internal error; reference = ...` (reads hit this too, not just writes).
`packages/db/src/busy-retry.ts` retries both forms for about half a second,
so a few BUSY lines in the log are normal; only a request that still fails
afterwards is a bug. The retry is on only under `alchemy dev`: both
Workers get `LOCAL_DEV=true` and pass `retryBusy` to `createDb` (the web
app through `dbFor`). Deployed, D1 is called directly.

If an edit under `packages/` shows `[Sync] Updated` in the log but no
`[Web] hmr update`, the web Worker is still running the old code; restart
the stack (`dev-stop.sh`, `dev-start.sh`) before trusting what you see.

Don't start it with a bare `pnpm dev > log &` from a script: `.alchemy/`
does not exist on a fresh checkout, and a background job without job
control ignores SIGINT, so it is hard to stop cleanly.

## Useful scripts

| Script                                                       | Does                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `.agents/skills/local-dev/scripts/db.sh "select * from sync_state"` | Query the local D1 database with Node's built-in SQLite (no argument: interactive shell, needs the `sqlite3` CLI) |
| `.agents/skills/local-dev/scripts/trigger-cron.sh`                  | Fire the scheduled sync now                                  |
| `.agents/skills/local-dev/scripts/reset.sh`                         | Delete all local state (stop `pnpm dev` first)               |
| `node .agents/skills/local-dev/scripts/feed-server.mjs`             | Serve the fixture feeds on :5175 (`dev-start.sh` runs it for you) |
| `.agents/skills/local-dev/scripts/seed-feeds.sh`                    | Subscribe the dev database to the fixture feeds              |

## Syncing real feeds locally (no internet needed)

The sync service fetches real HTTP, so give it something to fetch:

```sh
.agents/skills/local-dev/scripts/dev-start.sh   # also starts the feed server on :5175
.agents/skills/local-dev/scripts/seed-feeds.sh
.agents/skills/local-dev/scripts/trigger-cron.sh
.agents/skills/local-dev/scripts/db.sh "select id, last_outcome, last_http_status, last_error, title from feeds"
.agents/skills/local-dev/scripts/db.sh "select feed_id, count(*) from articles group by feed_id"
```

- The feed server serves `apps/sync/test/fixtures/` (the same files the
  tests use: RSS, Atom, RDF, JSON Feed, Latin-1, hostile HTML) with ETags,
  so a second sync gets 304s. `/status/<code>`, `/slow` and `/html` give
  you an HTTP error, a timeout and a page that is not a feed.
- `/generated.xml?run=<id>` is a feed that changes on demand: it starts
  with three items (or `&count=<n>` on the first request, up to 10,000),
  and each `curl localhost:5175/generated/add?run=<id>` adds one newer than
  the rest. Use it to land new articles mid-test (the unread browser tests
  do), then `trigger-cron.sh` to sync them in, or to make a long list.
- `seed-feeds.sh` subscribes to six fixtures and two failing URLs. A good
  first sync shows six feeds `ok`, one `http` (404 not found) and one
  `invalid_feed`.
- To add a fixture, put the file in `apps/sync/test/fixtures/`; the server
  picks it up without a restart.
- Want to sync again right away? The scheduled trigger ignores the 5-minute
  skip window (`trigger-cron.sh`); on-demand triggers don't. To refetch
  bodies instead of 304s: `db.sh "update feeds set etag = null, last_modified = null"`.
- Settings (`SYNC_SKIP_WINDOW_MINUTES`, budgets, retention...) come from
  `.env` or the shell when `pnpm dev` starts; see `.env.example`. Restart
  the stack to change them.

Sync logs are one JSON object per line, behind Alchemy's `[Sync]` prefix:

```sh
grep -a '"message":"sync run finished"' .alchemy/dev.log | tail -1
grep -a '"message":"feed fetch failed"' .alchemy/dev.log
```

Each run logs `sync run finished` (or `skipped`, or `cut short`) with its
counts, and each feed logs `feed synced` with its outcome, status, duration
and items found and new. Alchemy prefixes every line with `INFO:`, even
warnings; the real level is the JSON `level` field. Lines without JSON
after `[Sync]` (`create (local)`, `ready at ...`) are Alchemy's own, not
sync logs. Tests for the sync engine are in
`apps/sync/test/`; they serve the same fixtures through a fake `HttpFetch`
(`apps/sync/test/support.ts`), so they never touch the network.

## Tests

- `pnpm test`: unit and integration tests (Vitest). DB tests use a real
  local D1 through Miniflare (`createTestD1` in `@dusty/db/testing`), so
  they do not need `pnpm dev`.
- `pnpm test:e2e`: Playwright against the running stack, including the
  feed server (start both with `dev-start.sh`). `e2e/subscriptions.spec.ts`
  adds, refuses, renames, imports (OPML) and removes feeds through the
  settings page (`/settings`), and checks that junk in the URL (`?sort=bogus`)
  falls back to the default view. Each run subscribes to its own URLs (the
  feed server ignores the query string, so `rss.xml?run=<id>` is a fresh
  feed) and removes them again, so it works on any dev database. The one
  exception is home-page discovery: `site.html` advertises `/rss.xml`
  itself, so that test uses the plain `/rss.xml`, and removes it only if it
  added it (a seeded database keeps its own). A run that fails midway can
  leave a few feeds behind; `reset.sh` clears them.
- `e2e/unread.spec.ts` covers the unread lists: opening an article marks
  it read, marking it unread again, and "mark all above as read" with
  undo, including a sync landing between loading the list and the action
  (the spec's must-have). Each test subscribes to its own generated feed,
  since tests run in parallel; the helpers for that are in `e2e/helpers.ts`.
- `e2e/keyboard.spec.ts` does a full triage pass by keyboard (moving,
  reading, `m`, `A` with a sync landing in between, `u`, `r`, `?`, `gs` /
  `ga`), checks that typing in a field never fires a shortcut and that an
  unfinished `g` times out, and loads a 3,000-article feed to check that
  only a few dozen rows are in the DOM and `G` reaches the last.
- The smoke test (`e2e/smoke.spec.ts`) loads the page as the owner and expects the
  background sync request to return 200. The request returns 200 even
  when the run is skipped, so check the outcome in the log:
  `grep -a '"trigger":"on_load"' .alchemy/dev.log`.
  - If any run finished in the last 5 minutes (a `trigger-cron.sh`, say),
    the on-load run is skipped (`"reason":"recent"`) and `sync_state` keeps
    the earlier run's `last_trigger`. Only a run that really starts sets
    `last_trigger = on_load`. Start the stack with
    `SYNC_SKIP_WINDOW_MINUTES=0` to see one finish.
  - In dev each page load sends **two** sync requests: TanStack Start's
    default client entry wraps the app in React `StrictMode`, which runs
    the on-load effect twice in development (not in a production build).
    Expect two `on_load` lines, and with the skip window off, one run
    finishes and the other is skipped with `"reason":"running"`. That is
    the run lock working, not a bug.

## Changing the database schema

1. Edit `packages/db/src/schema.ts`.
2. `pnpm --filter @dusty/db generate` writes a new migration folder.
3. Commit both. `pnpm dev` applies it on the next start.

Never edit a migration that has been deployed; add a new one. If a
migration that was never deployed is regenerated (as happens on a feature
branch), local databases that already applied the old one won't match:
run `reset.sh` and start again.
