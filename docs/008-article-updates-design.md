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

- **Michael Tsai** (`/blog/feed/`, RSS): **100 items over about 6 weeks**
  (Oct 7 to Nov 17). 40 of them have `Update (YYYY-MM-DD)` paragraphs,
  often added **2 to 4 weeks after posting**. For example, a post from
  Oct 14 got an update on Nov 9. There is no per-item "modified" date;
  the only sign of an update is the text itself.
- **Daring Fireball** (`/feeds/main`, Atom): **48 entries over about a
  month**. The ★ articles go back further. `<updated>` moves after most
  posts, often by 0.1 to 20 hours with no "Update:" note: these are quiet
  edits. 5 entries have real updates. One was added **26 days** after
  posting (★ The iPhone Duo).
- **Size of a real update** (plain text added, measured from the first
  "Update" to the end): Daring Fireball's are 140 to 250 characters.
  Michael Tsai's are usually 150 to 800, but the smallest is
  "Update (2026-11-04): See also: Hacker News." at **50**.
- Comment counts (`slash:comments`) aren't part of the content hash, so
  they never look like changes.

Two things follow from this:

1. Updates arrive weeks later, while the post is still in the feed. So
   feed-based detection works for both sites. **But pruning deletes read
   articles 14 days after you read them**, and then sync skips their keys
   on purpose. Most of the late updates above would be lost. The plan has
   to keep read articles around while the feed still lists them (see
   "Pruning").
2. "The content changed" is mostly noise (quiet edits). The rule looks
   for the "Update" markers both sites write instead.

## Update markers

Both sites start each update with a paragraph that begins "Update":

- Michael Tsai: `Update (<a …>2026-11-04</a>):`, every time;
- Daring Fireball: `<strong>Update:</strong>`, `Update 2:`, and
  `[<strong>Update, Thursday:</strong>`.

One rule catches all of them: a block (`p`, `li`, `blockquote`, `div`,
heading, or after a `br`) whose text starts, after an optional `[` or
`(`, with the word "Update", then at most 40 characters with no line
break, then a colon. On the live feeds it finds **all 61** markers in
Michael Tsai's 40 updated posts and **all 6** in Daring Fireball's 5,
with no false matches. Quiet typo fixes never add a marker.

## The rule

An article is **updated** when its feed has **Show updates** turned on
(per feed, off by default), its content hash changed (sync already checks
this), and either:

1. **it has more update markers than before** (the main signal), or
2. **its plain text grew by at least `UPDATE_MIN_GROWTH_CHARS`**
   characters (default **300**, set by env var; `0` turns it off). This
   is a fallback for feeds that don't mark updates. It's set high because
   quiet edits are common (see Daring Fireball above), and it never fires
   for edits that delete or rewrite text.

When unsure, leave it read. An updated article goes back to unread. If it
was already unread, it is just marked as updated, so the row can say so.

## Schema (one migration)

`articles` gets:

- `update_marks integer`: how many update markers the content has. It is
  counted from the full cleaned HTML in `apps/sync/src/items.ts`, with a
  unit test against both real feeds. It starts as `null` like
  `text_length` below.
- `text_length integer`: length of the cleaned plain text, with
  whitespace collapsed. It is computed from the full content, even when
  the HTML is too big to store, the same way the excerpt is. Existing rows
  start as `null`, which means "unknown, don't bring back". The next
  fetch that changes them fills it in. After deploying, articles already
  stored get no updates until they change once.
- `surfaced_at integer not null`: when sync last put the article in front
  of you. It is set to `first_seen_at` on insert (the migration backfills
  it) and to `now` when an update counts. When
  `surfaced_at > first_seen_at`, the UI shows "Updated".
- `last_listed_at integer`: the last 200 response whose feed still listed
  this item. Pruning uses it. It is written only for Show-updates feeds.

`feeds` gets `show_updates integer not null default 0`.

## Sync (`packages/db` `recordFeedChanged`, `apps/sync`)

- `toStoredItem` also returns `updateMarks` and `textLength`.
- The upsert's `on conflict do update` makes the decision in the same
  atomic statement. No extra read and no race:

  ```sql
  read_at        = case when <counts> then null else articles.read_at end,
  read_action_id = case when <counts> then null else articles.read_action_id end,
  surfaced_at    = case when <counts> then excluded.updated_at else articles.surfaced_at end,
  update_marks   = excluded.update_marks,
  text_length    = excluded.text_length
  -- <counts> = (select show_updates from feeds where id = :feedId) = 1
  --   and (excluded.update_marks > articles.update_marks
  --     or (:minGrowth > 0
  --       and excluded.text_length - articles.text_length >= :minGrowth))
  -- (a null old value makes its comparison null, so it doesn't count)
  ```

- One more statement in the batch, for Show-updates feeds only: set
  `last_listed_at = now` for every item key in this fetch. It follows the
  pattern of the existing `pruned_items.last_seen_at` update.
- `recordFeedChanged` returns `{ newItems, editedItems, updatedItems }`.
  "Edited" means the hash changed; "updated" means the edit counted.
  Both go on the `sync.feed` span, the "feed synced" log and
  `metrics.feedFetched`, for every feed. That way the logs show how noisy
  a feed is before you turn this on.
- `UPDATE_MIN_GROWTH_CHARS` is added to `SETTING_DEFAULTS`, `SyncConfig`
  and `.env.example`.
- The schema comment and the `recordFeedChanged` doc are updated. The
  rule "sync never writes `read_at`" now has one written-down exception.

## Pruning

In a Show-updates feed, a read article is kept as long as the feed still
lists it. It is pruned only once it is past retention **and** missing from
the feed's last 200 response (`last_listed_at < feeds.last_changed_at`).
Every other feed is pruned the same as today. Storage stays bounded by
the feed's own length: about 100 articles for Michael Tsai and 50 for
Daring Fireball. Once an article leaves the feed, its updates can't reach
us anyway.

## Keeping "mark all above" exact

Today the snapshot rule is `first_seen_at <= seenBy`. A returned article
keeps its old `first_seen_at`, so without a change:

- an article that came back after the list loaded could be marked read by
  "Mark all above" in a feed's **All** view (it is on screen as read and
  its id is sent), without you ever seeing the update;
- the "new articles" notice (`hasArticlesSince`) would never fire for it.

Fix: every snapshot check uses `surfaced_at` instead of `first_seen_at`.
That means `listArticles`, `unreadCounts`, `hasArticlesSince`, `markRead`,
and the `articles_first_seen` index, which moves to `surfaced_at`.
`first_seen_at` keeps its other jobs (counting new items,
`last_published_at`). Tests in `packages/db` cover both cases against a
real local D1.

## What you see

- **Feeds settings**: each subscription row gets a **Show updates**
  switch (shadcn `Switch`), saved by a new `ownerOnly` server function
  `setShowUpdates`.
- **List rows**: an "Updated" badge with the update time
  (`RelativeTime`) when `surfaced_at > first_seen_at`.
- **Reader**: the same "Updated <time>" next to the date.
- **Order is unchanged**: lists still sort by `published_at`. In the
  triage list (oldest first), a returned article lands near the top,
  because its publish date is old. In a feed's list (newest first), it
  stays where it was. (See question 2.)

## Steps

1. Marker counting in `items.ts`, tested against trimmed copies of both
   live feeds saved as fixtures. Migration plus schema; the rule in
   `recordFeedChanged`, with tests (new marker → back, big growth → back,
   quiet edit → stays read, flag off → stays read, null old values → stays
   read, already unread → marked updated).
2. Pruning keeps listed articles in Show-updates feeds, with tests.
3. Snapshot checks move to `surfaced_at`, with tests for "mark all above"
   and the new-articles notice.
4. Sync: `textLength`, the setting, counts in metrics, logs and spans; a
   `run.test` case serving two versions of a fixture feed through
   `HttpFetch`.
5. Web: the switch, the server function, the badges; an e2e test that
   turns on Show updates, syncs an edited fixture and sees the article
   come back.
6. Docs: this file, the `AGENTS.md` note, and `.env.example`.

## Questions for you

1. **Keep the length fallback?** Markers cover both of your feeds. The
   300-character fallback is there for feeds without markers, at the cost
   of letting through the odd big quiet rewrite. It could also be off by
   default (`0`).
2. **Should a returned article move to the top?** That would mean sorting
   by `surfaced_at` instead of `published_at`. It's simple, but it changes
   the order rule the spec sets.
3. **Should the update be highlighted?** We could store the old text
   length and scroll to, or highlight, the added part. This plan doesn't
   include it; it could come later.

## Not in this plan

- **Updates made after a post leaves the feed.** That would mean
  re-fetching each article's page. Both of these feeds keep posts for 4
  to 6 weeks, which covers almost every update in the data above.
