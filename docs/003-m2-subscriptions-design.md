# M2: subscriptions and health design

Decisions made while building M2 (adding, renaming and removing feeds,
OPML import, and the subscriptions and health view). The spec says what
and why; this says how, where the spec leaves it open.

## Who does what

The web app never fetches feeds (spec), so everything that touches a feed
URL goes through the sync service's RPC:

- `addFeed(url)`: check, discover, fetch and store one feed.
- `importFeeds(entries)`: the same for a batch of OPML entries.

Renaming, removing and listing are plain D1 reads and writes in the web
app's server functions, using SQL from `packages/db`.

## Adding a feed

1. Normalise the URL: trim it, add `https://` if no scheme is given, and
   accept only http(s).
2. If that URL is already subscribed, refuse with a pointer to it.
3. Fetch it. If it parses as a feed, use it.
4. If it is an HTML page instead, look for the feed it advertises
   (`<link rel="alternate">` with an RSS, Atom or JSON Feed type), resolve
   that against the page URL, refuse it if it is already subscribed, and
   fetch that.
5. Store the feed and its articles straight away.

- This runs outside the sync lock and the skip window: a new feed syncs at
  once, even while a full run is going. It only writes its own new feed,
  which no running run has in its list.
- A URL that is not a feed, and does not lead to one, is refused with the
  reason in plain words ("404 not found", "no feed found at this address").
  Nothing is stored.
- The caller waits for the result (it is not a background `waitUntil`),
  so the page can show the feed's title and how many articles arrived.
- It is traced (`sync.add_feed`), logged and counted in metrics with the
  `new_subscription` trigger. Full runs no longer accept that trigger.

## OPML import

- The browser reads the file; the web app parses it and returns the
  feeds it lists, marking those already subscribed.
- The page then sends the rest to `importFeeds` in batches of 10, so it can
  show progress, and no single request runs long.
- Each entry is added like `addFeed` (without home-page discovery: OPML
  lists feed URLs), except:
  - articles already in the feed arrive **read**, so an import does not
    flood the unread list;
  - the title from the OPML file is kept as the display title when it
    differs from the feed's own, so names chosen in the old reader carry
    over.
- The import ends with a summary: added, skipped (already subscribed or
  listed twice) and failed (with the reason).
- A feed that fails is still subscribed, with its failure recorded, so a
  feed that happens to be down on migration day is not lost. It shows its
  error in the health view, and is flagged failing after 2 days, like any
  other feed. Only entries that are not web addresses are left out.

## Renaming and removing

- A rename sets `custom_title`; an empty name goes back to the feed's own
  title.
- Removing deletes the feed row; its articles, content and pruned keys go
  with it (foreign keys cascade), so they leave every list and count at
  once.

## The subscriptions view

- One query lists every feed with its unread count and health
  (`feedHealthSql`, the same SQL the metrics use).
- Per feed: last article posted, last successful sync, and, when failing,
  since when, how many failures in a row, and the latest error. A feed that
  has never synced successfully says so.
- Default order puts failing feeds first, then stale, then the rest by
  name. A filter shows only feeds that need attention. Sorting by name or
  unread count is also offered.
- The badge can be more specific than the metrics, which have only three
  buckets: a feed that has never synced shows "Never synced". The metrics
  count it as stale (it has no articles) until its 2 days are up, and as
  failing after that.
- Times read as relative ("3 days ago"). Hovering shows the exact time;
  tapping toggles it, for phones.
- Health thresholds (`FEED_FAILING_AFTER_HOURS`, `FEED_STALE_AFTER_DAYS`)
  are given to the web Worker too, from the same defaults as the sync
  service, so the view and the metrics agree.

## Not in M2

- Keyboard shortcuts (`gs` and friends) arrive in M4.
- Remembering permanent redirects is still open (see M1's notes).

## Follow-ups from the M2 review

Keep these in mind for later changes:

1. **Duplicates match on the exact URL.** `http://` vs `https://`, a
   trailing slash, `www.`, or a URL that redirects to a feed already
   subscribed are all treated as new. This matters most for OPML import,
   where an old reader's URLs may be stale. Fix it together with the open
   redirect handling: remembering where a feed redirects catches most of
   these.
2. **Import runs from the browser tab, 10 feeds at a time.** Closing the
   tab or losing the connection stops the rest; re-running is safe, since
   subscribed feeds are skipped. Add a "keep this page open" line to the
   import screen. A failed batch already reports where it stopped instead
   of failing silently; keep it that way.
3. **Adding by hand can take about 30 seconds** (a home page and then its
   feed, each with a 15 s timeout). The form shows "Adding…" while it
   waits; check that this reads as progress on a slow site, not as stuck.
4. **The web app imports URL helpers from the sync package**
   (`@dusty/sync/urls`). If more code needs sharing between the two apps,
   move it into `packages/` instead of growing that export.
