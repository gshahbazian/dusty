# Updated articles come back as unread

Nov 18, 2026 · built

Some writers keep adding to posts after publishing them. Michael Tsai adds
dated "Update (…)" paragraphs, and Daring Fireball adds "Update:" notes.
Sync always stored the new text, but a post you had read never showed up
again, so you missed the update. Now, in feeds you turn **Show updates**
on for, an update brings a read article back as unread.

## What the live feeds showed (fetched Nov 18, 2026)

The copies in `apps/sync/test/fixtures/real` are cut down to 10 items.
The live feeds are much longer:

- **Michael Tsai** (`/blog/feed/`, RSS): 100 items over about 6 weeks.
  40 of them have `Update (YYYY-MM-DD)` paragraphs, often added 2 to 4
  weeks after posting. There is no per-item "modified" date; the only
  sign of an update is the text itself.
- **Daring Fireball** (`/feeds/main`, Atom): 48 entries over about a
  month. `<updated>` moves after most posts, often by 0.1 to 20 hours
  with no "Update:" note: these are quiet edits. 5 entries have real
  updates. One was added 26 days after posting.
- A real update adds 50 to 800 characters of text. The smallest is
  "Update (2026-11-04): See also: Hacker News."
- Comment counts (`slash:comments`) aren't part of the content hash, so
  they never look like changes.

So updates arrive while the post is still in the feed, which means
reading the feed is enough. But by then the article has often been read
and pruned (14 days after reading), so pruned articles are covered too.

## The rule

An edit is an **update** when the feed has Show updates on and the
article's plain text grew by at least `UPDATE_MIN_GROWTH_CHARS` (default
20) since the version sync last stored.

- Every real update in the data above adds far more than 20 characters,
  so the rule doesn't look for "Update" markers, and it works for feeds
  that don't write them. Markers were considered and dropped: at 20
  characters they catch nothing the length misses.
- Edits that remove or reword text never count. Every edit stores the
  new length, so small edits never add up.
- The known cost: a quiet edit that adds 20 or more characters (a link, a
  sentence) brings the post back too. The `items_edited` and
  `items_updated` counts in the logs show how often that happens per
  feed, and Show updates can be turned off for a feed that gets noisy.

An updated article that was read is unread again. One that was already
unread stays unread and is marked as updated. Either way it keeps its
place in the list (sorted by `published_at`, as always), and nothing in
the text is highlighted.

## Schema (`20261118183614_article_updates`)

- `articles.text_length`: characters of the cleaned plain text, whitespace
  collapsed, counted from the full content (even when the HTML is too big
  to store), like the excerpt. Null for articles stored before this,
  which never count as updated until an edit stores a length.
- `articles.surfaced_at`, not null: when sync last put the article in
  front of you. It is `first_seen_at` on insert (the migration backfills
  it) and the update's time when an update counts.
- `feeds.show_updates`, default off.
- `pruned_items.text_length` and `pruned_items.first_seen_at`, copied from
  the article when it is pruned. Every 200 that still lists the key
  stores its current length there.

The migration is hand-edited in one place: SQLite can't add a `not null`
column without a default to a table with rows, so `surfaced_at` is added
with default 0 and then filled from `first_seen_at`.

## Sync (`recordFeedChanged` in `packages/db/src/feeds.ts`)

Everything happens in the existing atomic batch, with no extra reads:

1. **Stored articles.** The upsert's `on conflict do update` checks the
   rule against `articles.text_length`. When it holds, it clears `read_at`
   and `read_action_id` and sets `surfaced_at = now`, in the same
   statement that stores the edit.
2. **Pruned articles.** The upsert used to skip every pruned key. Now it
   lets one through when the rule holds against the pruned row's length.
   The article is stored again, unread, with its content, its old
   `first_seen_at` (or the prune time, for keys pruned before that was
   kept) and `surfaced_at = now`. A statement after the upsert deletes its
   `pruned_items` row.
3. **Pruned keys still listed** get `last_seen_at` and their current
   length. This is written as an upsert that only ever updates, so SQLite
   loops over the items and looks each key up. Written as
   `update … from json_each`, it scanned every item for each pruned key.

The pruned key's content hash turned out not to be needed: an update is
text that got longer, which the length alone shows. Keys pruned before
this have no length. The first fetch that lists one stores it, and later
growth counts from there.

`recordFeedChanged` returns `{ newItems, editedItems, updatedItems }`.
The `sync.feed` span, the "feed synced" log and the feed metrics point
carry `items_edited` and `items_updated` for every feed. The run sums
`items_updated`. Both are appended to the Analytics Engine layouts in
`apps/sync/src/metrics.ts`.

## Keeping "mark all above" exact

The snapshot rule was `first_seen_at <= snapshotAt`. An article brought
back keeps its old `first_seen_at`, so after the list loaded, "Mark all
above" in a feed's All view could have marked it read (its read row was
on screen, so its id was sent) without you ever seeing the update. And the
"new articles" notice would never have noticed it.

`listArticles`, `unreadCounts`, `hasArticlesSince` and `markRead` now
check `surfaced_at`, and the snapshot index moved to it. The tests in
`packages/db/test/articles.test.ts` fail against the old rule.

## What you see

- **Settings → Subscriptions**: each feed has a Show updates switch
  (shadcn `Switch`), saved at once by `setSubscriptionShowUpdates`.
- **List rows and the reader**: "Updated <time>" for an article an update
  brought back. `ArticleRow.updatedAt` is `surfaced_at` when it's later
  than `first_seen_at`, else null. (That's not the `updated_at` column,
  which is any edit's time.)

## Testing

- `packages/db`: the rule for stored and pruned articles (grows enough,
  grows too little, shrinks, flag off, unknown length, already unread,
  small edits that would add up), and the snapshot cases.
- `apps/sync/test/run.test.ts`: two versions of a feed written the way
  mjtsai.com updates. A typo fix leaves the article read; an added
  "Update" line brings it back and is counted in the metrics.
- `e2e/updates.spec.ts`: the switch, a read article, an update from the
  feed server's `/generated/update`, a sync, and the article back unread
  and marked Updated.

## Not built

- **Updates made after a post leaves the feed.** That would mean
  re-fetching each article's page. Both feeds keep posts for 4 to 6
  weeks, which covers every update in the data above.
- Highlighting the new text, or moving updated articles to the top.
