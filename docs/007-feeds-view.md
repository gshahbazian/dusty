# Feeds: unread or all, per feed

The spec's lists are unread only. After M5 the owner asked for a way to
see a feed's read articles too. This records what changed.

## What the owner sees

- The top bar's first item is **Feeds** (it was "Unread"). `/` is still
  every unread article, oldest first: the daily triage pass.
- The feed picker lists **All unread** and then **every** feed, with its
  unread count, including feeds with nothing unread (`Name (0)`), so a
  caught-up feed's history is one pick away.
- On a feed's page, an **Unread / All** toggle sits under the picker.
  Unread is the default; All lists every stored article of that feed,
  newest first, read ones dimmed and offering Mark unread. All unread has
  no toggle: it is the triage list.
- The choice is in the URL (`/feeds/12?show=all`), so it survives a
  reload and can be linked. Switching closes any open article (a new
  list), and picking another feed starts at Unread.

## How

- `listArticles(db, { feedId, seenBy, show })` replaces `listUnread`.
  `show: 'all'` (a feed only) drops the unread filter; the snapshot rule
  (`first_seen_at <= seenBy`) still applies, so "mark all above" acts on
  exactly the rows on screen. The global list ignores `show`.
- Each row carries `readAt`. The page starts each row read or unread from
  it, and counts move by each row's change since loading (down when marked
  read, up when a loaded-read row is marked unread).
- "All" shows what is stored: read articles are pruned after
  `READ_RETENTION_DAYS` (14), so a feed's history goes back about that far.
