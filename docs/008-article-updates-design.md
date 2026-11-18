# Updated articles come back as unread (plan)

Nov 18, 2026 · draft, not built yet

Some writers keep adding to posts after publishing them. Michael Tsai adds
dated "Update (…)" paragraphs, and Daring Fireball adds "Update:" notes.
Right now sync already stores the new text quietly. A post you have read
never shows up again, so you miss the update. This plan makes a real
update to a read article mark it unread again, for feeds you turn this on
for.

## What the live feeds show (fetched Nov 18, 2026)

The copies in `apps/sync/test/fixtures/real` are cut down to 10 items.
The live feeds are much longer:

- **Michael Tsai** (`/blog/feed/`, RSS): **100 items over about 6 weeks**.
  40 of them have `Update (YYYY-MM-DD)` paragraphs, often added **2 to 4
  weeks after posting**. There is no per-item "modified" date; the only
  sign of an update is the text itself.
- **Daring Fireball** (`/feeds/main`, Atom): **48 entries over about a
  month**. `<updated>` moves after most posts, often by 0.1 to 20 hours
  with no "Update:" note: these are quiet edits. 5 entries have real
  updates. One was added **26 days** after posting.
- **Size of a real update** (plain text from the first "Update" to the
  end): 50 to 800 characters. The smallest is "Update (2026-11-04): See
  also: Hacker News."
- Comment counts (`slash:comments`) aren't part of the content hash, so
  they never look like changes.

So updates arrive while the post is still in the feed, which means
reading the feed is enough. But by then the article has often been read
and pruned (14 days after reading), so pruned articles have to be
covered too.

## The rule

An article is **updated** when its feed has **Show updates** turned on
(per feed, off by default), its content hash changed, and its plain text
**grew by at least `UPDATE_MIN_GROWTH_CHARS` characters** (default 20).

- Every real update above adds far more than 20 characters, so there is
  no need to look for "Update" markers. The rule also works for feeds that
  don't write them.
- Edits that delete or rewrite text never count.
- The known cost is quiet edits that add 20 or more characters (a link, a
  sentence). They bring the post back with nothing much new to read. The
  "edited" vs "updated" counts in the logs show how often this happens.
  Show updates can be turned off for a feed that gets noisy.
- Growth is measured against the last stored version, and every change
  updates the stored length, so small edits never add up.

An updated article goes back to unread, in its normal place in the list
(sorted by `published_at` as always). If it was already unread, it is just
marked as updated. Nothing is highlighted.

## Schema (one migration)

`articles` gets:

- `text_length integer`: length of the cleaned plain text, with
  whitespace collapsed. It is computed from the full content, even when
  the HTML is too big to store, the same way the excerpt is.
- `surfaced_at integer not null`: when sync last put the article in front
  of you. It is set to `first_seen_at` on insert (the migration backfills
  it) and to `now` when an update counts.

`pruned_items` gets `content_hash text`, `text_length integer` and
`first_seen_at integer`. They are copied from the article when it is
pruned, so a pruned article can be compared and brought back without
keeping its HTML.

`feeds` gets `show_updates integer not null default 0`.

All the new columns start as `null` on existing rows, which means
"unknown, don't bring back". An article becomes eligible after its next
change, or once it's pruned after the deploy.

## Sync (`packages/db` `recordFeedChanged`, `apps/sync`)

`toStoredItem` also returns `textLength`. In the existing atomic batch:

1. **Articles still stored.** The upsert's `on conflict do update` makes
   the decision itself, with no extra read and no race:

   ```sql
   read_at        = case when <counts> then null else articles.read_at end,
   read_action_id = case when <counts> then null else articles.read_action_id end,
   surfaced_at    = case when <counts> then excluded.updated_at else articles.surfaced_at end,
   text_length    = excluded.text_length
   -- <counts> = (select show_updates from feeds where id = :feedId) = 1
   --   and excluded.text_length - articles.text_length >= :minGrowth
   -- (a null old length makes this null, so it doesn't count)
   ```

2. **Pruned articles.** Today the upsert skips every key in
   `pruned_items`. Now it lets a pruned key through when the same
   condition holds against the pruned row (Show updates is on, the hash
   differs, the text grew by at least the minimum). That article is
   inserted again as unread. It keeps its original `first_seen_at` from
   the pruned row, gets `surfaced_at = now`, and gets the feed's
   `published_at` as usual. So it shows the "Updated" badge and isn't
   counted as a new item. A statement after the upsert deletes the
   `pruned_items` rows of the articles it brought back.
3. **Quiet edits to pruned articles.** A pruned key whose hash changed
   without counting gets its stored `content_hash` and `text_length`
   updated, so small edits never add up. This goes in the same statement
   that already sets `last_seen_at`.

Also:

- `recordFeedChanged` returns `{ newItems, editedItems, updatedItems }`.
  "Edited" means the hash changed; "updated" means the edit counted, for
  stored and pruned articles alike. Both go on the `sync.feed` span, the
  "feed synced" log and `metrics.feedFetched`, for every feed.
- `pruneArticles` copies `content_hash`, `text_length` and
  `first_seen_at` into `pruned_items`. Pruning works as before: read
  articles still go 14 days after reading, and pruned keys are forgotten
  30 days after their item leaves the feed. Once a post is out of the
  feed, its updates can't reach us anyway.
- `UPDATE_MIN_GROWTH_CHARS` is added to `SETTING_DEFAULTS`, `SyncConfig`
  and `.env.example`.
- The doc comments for the schema, `recordFeedChanged` and `pruned_items`
  are updated. The rule "sync never writes `read_at`" and the rule
  "pruned articles stay gone" now each have one written-down exception.

## Keeping "mark all above" exact

Today the snapshot rule is `first_seen_at <= seenBy`. An article that
comes back keeps its old `first_seen_at`, so without a change:

- an article that came back after the list loaded could be marked read by
  "Mark all above" in a feed's **All** view (it is on screen as read and
  its id is sent), without you ever seeing the update;
- the "new articles" notice (`hasArticlesSince`) would never fire for it.

Fix: every snapshot check uses `surfaced_at` instead of `first_seen_at`.
That means `listArticles`, `unreadCounts`, `hasArticlesSince`, `markRead`,
and the `articles_first_seen` index, which moves to `surfaced_at`.
`first_seen_at` keeps its other jobs (counting new items,
`last_published_at`).

## What you see

- **Feeds settings**: each subscription row gets a **Show updates**
  switch (shadcn `Switch`), saved by a new `ownerOnly` server function
  `setShowUpdates`.
- **List rows and reader**: an "Updated <time>" badge (`RelativeTime`)
  when `surfaced_at > first_seen_at`.
- The list order doesn't change, and nothing is highlighted.

## Steps

1. Migration plus schema. The stored-article rule in `recordFeedChanged`,
   tested against a real local D1: grows by 20 or more → back; grows by
   less → stays read; flag off → stays read; null old length → stays
   read; already unread → marked updated.
2. Bringing back pruned articles: the copy at prune time, the upsert,
   and the cleanup, with tests: pruned and grown → back with its old
   first-seen time; pruned and quietly edited → stays gone, new length
   stored; pruned before the deploy (null) → stays gone.
3. Snapshot checks move to `surfaced_at`, with tests for "mark all above"
   and the new-articles notice.
4. Sync: `textLength`, the setting, counts in metrics, logs and spans; a
   `run.test` case serving two versions of a fixture feed through
   `HttpFetch`.
5. Web: the switch, the server function, the badge; an e2e test that
   turns on Show updates, syncs an edited fixture and sees the article
   come back.
6. Docs: this file, the `AGENTS.md` note, and `.env.example`.

## Not in this plan

- **Updates made after a post leaves the feed.** That would mean
  re-fetching each article's page. Both feeds keep posts for 4 to 6
  weeks, which covers every update in the data above.
- Highlighting the new text, or moving updated articles to the top.
