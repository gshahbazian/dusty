# M1: sync engine design

Decisions made while building M1 (sync engine, schema, health fields,
pruning, tracing, logs and metrics). The spec (`001-project-spec.md`) says
what and why; this says how, where the spec leaves it open.

## Schema (D1, times in epoch ms)

- `feeds`: the subscription plus everything a fetch learns about it.
  - Conditional-request state: `etag`, `last_modified`.
  - Health: `last_fetched_at`, `last_outcome`, `last_http_status`,
    `last_success_at` (a 200 or 304), `last_changed_at` (last 200),
    `last_published_at` (newest article date ever seen),
    `first_failure_at` and `consecutive_failures` (reset on success),
    `last_error` (plain words, e.g. "404 not found").
- `articles`: one row per feed item, metadata only (title, link, author,
  dates, excerpt, read state). Lists and counts read only this table.
  - Identity is `(feed_id, item_key)`, unique. `item_key` is the item's
    guid or id, else its link, else a hash of its title and date.
  - `first_seen_at` never changes after insert. M3's snapshot filter
    (`first_seen_at <= snapshotAt`) depends on it.
  - `read_at` and `read_action_id` are never written by sync, so a
    re-fetch or a source edit cannot mark a read article unread.
  - `content_hash` lets an unchanged item skip its write.
- `article_content`: the cleaned HTML, one row per article that has
  content, keyed by `article_id` and deleted with its article. Opening an
  article is the only read of it.
  - D1 limits a single value to about 2 MB, so a fetch's items are written
    as JSON chunks of under 1 MB each, all in the same atomic batch.
  - HTML over 400 KB after cleaning is not stored; the article keeps its
    title, excerpt and link to the original.
- `pruned_items`: keys of read articles that pruning deleted, so a later
  sync never brings them back as unread.
- `sync_state`: the single-row run lock, now with a `run_id` per claim.

## A run

1. Claim the lock (skip if running, or if recent for on-demand triggers).
   Each claim gets a fresh `run_id`, and finishing only releases the lock
   while that id still holds it. A slow run whose lease expired can no
   longer release a newer run's lock.
2. Sync feeds, least recently fetched first, 6 at a time (the Workers
   limit on open connections per invocation).
3. Prune read articles, then clean up `pruned_items`.
4. Count healthy, stale and failing feeds; write run metrics.
5. Release the lock with the outcome: `completed` or `cut_short`.

**Time budget.** On-demand runs are started from the web app's
`waitUntil`, which Cloudflare stops 30 seconds after the response. So each
run has a budget that every feed fetch finishes within: 25 s on demand,
10 min scheduled (both configurable). After the last feed, pruning, the
health count and releasing the lock take a few more database calls (tens
of milliseconds), well inside the lock's 10 s margin and the 5 s left
before Cloudflare's limit.

- A feed only starts if a full fetch timeout (15 s) still fits before the
  end of the budget. Feeds are usually far quicker (most answer 304), so an
  on-demand run gets through many feeds in its first 10 seconds.
- A run that runs out of budget ends as `cut_short` and says so in logs and
  metrics. Because feeds go least recently fetched first, the next run picks
  up where this one stopped.
- The lock lasts the run's budget plus 10 s (35 s on demand), not a fixed
  15 minutes. If Cloudflare kills an on-demand run anyway, the next sync is
  blocked for seconds, not for a quarter of an hour.

This needs no queue or workflow, and the spec already asks for "a run cut
short (time limit)" to be logged.

**Per feed** (span `sync.feed`, children `feed.fetch`, `feed.parse`,
`feed.store`):

- Fetch with `If-None-Match` / `If-Modified-Since`, a clear user agent, a
  timeout (15 s) and a size cap (5 MB). A 304 is a success that skips
  parsing.
- Errors are classified as `timeout`, `network`, `http`, `too_large` or
  `invalid_feed`, and recorded on the feed. They never fail the run.
- Store is one atomic D1 batch: upsert the items (one statement, the items
  passed as JSON through `json_each`, skipping keys in `pruned_items`),
  refresh `pruned_items.last_seen_at` for keys still in the feed, and
  update the feed's health fields.
- Article HTML is cleaned with a strict allowlist before it is stored
  (`apps/sync/src/clean.ts`). `htmlparser2` parses it the way a browser
  would; we drop dangerous elements with their content (scripts, styles,
  frames, forms, SVG, MathML), unwrap unknown ones, keep only allowlisted
  attributes, and only http(s) links and images (plus `mailto:`). The tree is
  then re-serialised, so all text and attributes are escaped again.
  Titles (article and feed) are stored as plain text, and a plain-text
  excerpt is stored alongside. Item and site links that are not http(s)
  are not stored at all, so they can never become an `href`.
  - We tried the `xss` package first. It is CommonJS with typings that do
    not match its runtime shape, so it fails under Node's ESM loader (which
    Alchemy uses), and it leaks the body of an unclosed `<script>` as text.
- Bodies are decoded with the charset from the `Content-Type` header, else
  the XML declaration, else UTF-8. Workers' `TextDecoder` only knows UTF-8,
  so the Latin-1 family (ISO-8859-1, Windows-1252, US-ASCII) is decoded by
  hand.
- Publish dates come from the feed. A missing date, or one more than a day
  in the future, uses `first_seen_at`, so a bad date cannot pin an
  article to the top of a list.

## Pruning

- Read articles are deleted `READ_RETENTION_DAYS` (14) after `read_at`.
  Their keys go into `pruned_items` in the same batch.
- A `pruned_items` row is dropped once its item has been absent from the
  feed for `PRUNED_ITEM_RETENTION_DAYS` (30). "Absent" needs evidence:
  - a 200 response refreshes `last_seen_at` for the keys it contains;
  - a 304 means nothing changed, so it refreshes every key seen in the
    last 200 response;
  - a failing feed refreshes nothing, but its rows are not dropped either.
    A row is dropped only if a successful fetch has happened since it was
    last seen, so an outage longer than 30 days cannot bring old articles
    back.

## Health

Shared SQL in `packages/db` so M2's health view and M1's metrics agree.

- **Failing**: no successful fetch for `FEED_FAILING_AFTER_HOURS` (48),
  counting from when it was added if it never succeeded.
- **Stale** (not failing): newest article older than
  `FEED_STALE_AFTER_DAYS` (90), or no articles at all. The spec doesn't
  define stale; 90 days is a starting point.
- **Healthy**: everything else.

## Observability

- **Logs**: one flat JSON object per line (`apps/sync/src/logger.ts`), so
  Workers Logs indexes every field (`feed_id`, `outcome`, `duration_ms`,
  ...). Cloudflare attaches the active trace and span ids to every log line
  (`$metadata.traceId` / `spanId`). The logger is provided to each handler:
  Alchemy runs handlers in their own fibers, so providing it to the Worker
  setup alone leaves Effect's default logger in place.
- **Traces**: `sync.run` > `sync.feed` > `feed.fetch` / `feed.parse` /
  `feed.store`, plus `sync.prune` and `sync.health`. Spans carry the same
  fields as the logs. On-demand runs join the web app's trace (confirmed on
  a real deploy in M0).
- **Metrics**: a Workers Analytics Engine dataset, `dusty_sync` (kept 3
  months by Cloudflare). One data point per run (trigger, outcome, duration,
  feed counts, new articles, healthy/stale/failing) and one per feed fetch
  (feed, outcome, error type, status, duration, items found and new). The
  column layout is documented on `Metrics` in `apps/sync/src/metrics.ts`.
- The sync Worker sets `observability` explicitly, and raises its CPU limit
  to 5 minutes for a full scheduled run.

## Settings

Every number above is an env var with a default, listed in
`SETTING_DEFAULTS` (`apps/sync/src/config.ts`) and `.env.example`. Alchemy
does not carry `Config` values read in a Worker's setup into the deployed
Worker, so the sync Worker's props read them where `alchemy deploy` (or
`dev`) runs and pass them as plain env vars, and the Worker reads them back
at runtime.

## Not in M1

- Adding a feed syncs just that feed right away, outside the run lock and
  skip window (M2, with subscriptions).
- Following permanent redirects by updating the stored feed URL.
