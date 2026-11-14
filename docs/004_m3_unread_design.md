# M3: unread lists and mark all above

Decisions made while building M3 (the unread lists, reading, marking read
and unread, "mark all above as read" with undo, manual refresh and the
Content Security Policy). The spec says what and why; this says how.

## Lists

- `/` is the global unread list, oldest first. `/feeds/$feedId` is one
  feed's unread list, newest first. Both sort by `published_at`, with `id`
  as the tiebreak (same direction), so the order never shuffles.
- Each list is one query over `articles` (metadata only; never
  `article_content`), with the feed's display title joined in.
- A list is a **snapshot**: the loader returns its rows and `snapshotAt`
  (the server's time when it was read). The page keeps those rows until
  the owner refreshes. Marking an article read or unread changes how its
  row looks, never where it is, so rows do not jump under the cursor.
- Unread counts (global and per feed) come from one query, loaded with the
  list. After a mark, the page adjusts them by what the server says it
  changed, so counts and rows agree without reloading the list.
- Whole lists are loaded for now. Rendering thousands of rows smoothly
  (virtualization) is M4.

## Marking

Every write returns the IDs it actually changed, and the page only shows
what the server confirmed. If a write fails, the owner is told and nothing
on screen changes.

- **Mark read** (a row's button, or opening the article) and **mark unread**
  act on one article.
- **Mark all above as read** sends exactly the IDs of the rows above the
  chosen one, in on-screen order, plus the list's `snapshotAt`. One
  statement does it:

  ```sql
  update articles set read_at = :now, read_action_id = :action
  where id in (select value from json_each(:ids))
    and read_at is null
    and first_seen_at <= :snapshotAt
  returning id
  ```

  - Only listed IDs can change, so an article that arrived after the list
    was loaded is never touched, even if it would sort above the row.
  - `first_seen_at <= snapshotAt` is a second guard against the same thing.
  - Rows already read stay read and are not part of the action.
  - `json_each` takes the IDs as one JSON parameter, so any number fits
    under D1's 100-parameter limit.
- Each mark-read action gets a fresh `read_action_id`. **Undo** clears
  exactly the rows still carrying that id:

  ```sql
  update articles set read_at = null, read_action_id = null
  where read_action_id = :action
  returning id
  ```

  A row marked unread (or read again by a later action) since then no
  longer carries the id, so undo never touches it.

## Reading an article

- Opening a row shows the article over the list (`?article=<id>` on the
  list's URL), so going back finds the list exactly as it was. On a phone it
  fills the screen; on a wide screen it sits beside the list.
- Opening marks it read (one action, so it can be undone or marked unread).
- The HTML is the cleaned copy from `article_content`. Links open in a new
  tab with `rel="noopener noreferrer"`. A link to the original is always
  shown.

## Manual refresh

- A refresh button reloads the list and counts (a new snapshot) and asks
  the sync service to run, with the same skip-if-recent rule as on load.
- It shows that it is working, then when the data was last refreshed.
- Where the cursor lands afterwards is M4, along with the cursor itself.

## Content Security Policy

Every HTML response gets a strict policy with a fresh nonce:

- `script-src 'nonce-…' 'strict-dynamic'`: only scripts the app rendered
  run (TanStack Start's shell has inline bootstrap scripts, which carry the
  nonce), and they may load the app's own chunks. Article HTML never has
  scripts (the cleaner removes them), and this would block them anyway.
- `default-src 'none'`, plus only what the app needs: its own styles,
  fonts and API calls, and images from anywhere over https (article
  images). No frames, plugins, or form posts elsewhere.
- The worker makes the nonce and passes it in the request context; the
  router's `ssr.nonce` puts it on every script it renders.
- `alchemy dev` adds only what Vite's dev server needs (its HMR socket and
  inline preamble), so the policy is exercised locally too.

## Follow-ups for M4

- **Long lists.** `listUnread` has no limit; the whole list is one query
  and one response (about 400–500 bytes of JSON a row). In M4, together
  with virtualization:
  - virtualize the rows, so thousands of them don't slow scrolling or keys;
  - guard very large lists. A first load with tens of thousands of unread
    articles is heavy, and `markArticlesRead` takes at most 20,000 IDs;
  - if a list needs real paging, page by list position (published time
    plus id), not page number, with every later page limited to
    `first_seen_at <= snapshotAt`. The loaded pages then stay one snapshot,
    so mark all above, undo and the counts work unchanged.
