# M4: the cursor, keyboard shortcuts and long lists

M4 makes a full triage pass possible without the mouse, and keeps long
lists fast. The spec's "Keyboard shortcuts (vim motions)" section is the
brief; "Unread lists" asks that thousands of rows not slow scrolling or
key presses, and "Manual refresh" says where the cursor lands afterwards.
Follow-ups M3 left for M4 are in `docs/004_m3_unread_design.md`.

## Layout

Kept deliberately plain (the owner will design the UI by hand later); the
point is the right elements, working:

- **Top bar**: Unread, Settings, a `?` hint and Log out.
- **Article sidebar**: a feed picker (`<select>`: All unread, then each
  feed with unread articles, with counts), the list's title, count and
  Refresh, then the articles. It scrolls on its own. This replaces M3's
  separate feed sidebar.
- **Content area**: the open article, scrolling on its own, beside the
  sidebar from 1024 px; below that it replaces the sidebar until closed.
- **Settings**: M3's subscriptions page, renamed (`/settings`): adding,
  importing, renaming, removing and feed health.
- Notices (marked, undone, failed) are a toast at the bottom, so one
  appearing never pushes the list down. Row actions sit on their own line
  with a fixed-width read toggle, so marking a row never changes its
  height (in the narrow sidebar, "Mark unread" used to wrap and move every
  row below it by a line).

## The cursor

- One row of the list is the cursor: a visible accent on the row, and
  `data-cursor` on it for tests. It starts on the first row, or on the
  article in `?article=` if one is open.
- The cursor is an article id, not a position, so it means the same row
  whatever else changes. Clicking a row (or opening it) moves the cursor
  there; mouse hover does not.
- Moving the cursor scrolls the sidebar just enough to keep its row in
  view. This is measured against the live scroll position: TanStack
  Virtual's own `scrollToIndex` with `align: 'auto'` works from a scroll
  offset that lags a frame, and scrolled back over our own scrolling
  (seen as `Ctrl-d` not scrolling). Far jumps (`G`, big counts) still go
  to the virtualizer, which measures rows as it gets there.
- After a refresh the cursor goes back to the same article if the new list
  still has it, else to the top (the spec's rule). The id lives above the
  per-snapshot state, so it survives the remount a refresh causes.
- DOM focus is not moved with the cursor: focus stays where the owner left
  it, so the notice's Undo button and the Refresh button keep working with
  Tab. (Screen-reader announcement of the cursor is left for M5.)

## Bindings

The spec's table, confirmed, with the article-open behaviour it asks for
made concrete. One table in code (`keymap.ts`) drives both the key
handling and the `?` overlay, so the overlay can't drift from what is
bound.

| Keys | List | Article open |
| --- | --- | --- |
| `j` / `k` (count) | Next / previous row | Next / previous article, opened in place |
| `↓` / `↑` (count) | Next / previous row | Scroll the article down / up |
| `Space` / `Shift-Space` | Half a page down / up | Scroll the article a page down / up |
| `gg` / `G` | First / last row | First / last row |
| `Ctrl-d` / `Ctrl-u` | Half a page down / up | Scroll the article half a page |
| `o`, `Enter` | Open the article | — |
| `Esc`, `q` | — | Close the article |
| `v` | Open the original in a new tab | Same |
| `m` | Toggle read on the cursor row | Toggle read on the open article |
| `A` | Mark all above the cursor row as read | Same |
| `u` | Undo the last mark action | Same |
| `r` | Refresh | Same |
| `]` / `[` | Next / previous feed | Same |
| `ga` / `gs` | Go to all unread / settings | Same |
| `?` | Show the shortcuts | Same |

- With an article open, `j` / `k` open the next or previous article in
  its place (the spec's "moving to the next article does not need closing
  first"); the arrow keys, Space / Shift-Space and `Ctrl-d` / `Ctrl-u`
  scroll it. (Changed after deploying M5: first, `j` / `k` scrolled the
  article and `J` / `K` moved on, which, with the article beside the list,
  made `j` look broken after clicking a row.)
- Counts (`5j`) apply to `j`, `k` and the arrow keys, capped at 999.
- `A` calls the same `markAllAbove(cursorId)` the button does: the ids of
  the rows above on screen, plus the list's snapshot time. The guarantees
  come from the same code, not a copy of it.
- `u` undoes the latest mark action in this list that hasn't been undone,
  even after its notice was dismissed. With nothing to undo it says so.
- `]` / `[` walk the feed picker's order (All unread, then each feed with
  unread articles) and stop at the ends. They start from where the router
  is going, so a second `]` pressed before the next list loads still moves
  on (the cloud check found two quick presses landing on the same feed).
- `m` with an article open acts on that article, which may not be in the
  list (opened from a link after it was read). Its view then knows it is
  read and offers Mark unread.
- An article is marked read once for being opened. A refresh shows it
  again without "opening" it again, so marking it unread while reading
  sticks; closing it and opening it again reads it.
- `ga`, `gs` and `?` work on every page; the rest only on the unread
  lists.

## Key handling

- One `keydown` listener on the window, in the app shell. Pages register
  what their commands do; the shell owns the parser, the go-to commands
  and the `?` overlay.
- The parser (`key-parser.ts`) is pure and unit tested: it takes a key and
  the time and returns a command with its count, "waiting for more", or
  nothing. A count or a `g` waits at most 1 s for the next key; after that
  the pending keys are dropped, so a stray `g` never turns a later key into
  something else. A key that doesn't finish what is pending drops it and
  counts on its own (`g` then `Ctrl-d` is `Ctrl-d`): a swallowed key would
  reach the browser, and `Ctrl-d` there bookmarks the page. Pending keys show in a small hint at the bottom of the
  screen while they wait.
- Keys are ignored while typing (in an input, textarea, select or
  contenteditable), while composing text (IME), and with Cmd or Alt held,
  so browser and system shortcuts are untouched. Ctrl is used only for
  `Ctrl-d` / `Ctrl-u`.
- While the `?` overlay is open, only `Esc`, `q` and `?` do anything (they
  close it).
- A handled key calls `preventDefault`, so `Ctrl-d` doesn't bookmark and
  `/`-style browser defaults don't fire; unbound keys are left alone.

## Long lists

- **Virtualized rows.** The list renders only the rows near the viewport
  (`@tanstack/react-virtual` on the sidebar's scroll, measured row
  heights, some overscan). Thousands of rows cost a few dozen DOM nodes, so
  scrolling and key presses stay fast. Rows keep `aria-setsize` and
  `aria-posinset` so the list's length is still announced.
- **A cap on what one list loads.** `listUnread` returns at most 5,000
  rows; the counts still count everything. When a list is longer, the
  page says "Showing the first 5,000 of N" and Refresh, after triaging
  those, loads the next ones. 5,000 rows is about 2.5 MB of JSON, and
  "mark all above" then sends at most 4,999 ids, inside the server's
  20,000 limit.
- Paging within one snapshot (noted in M3) isn't needed with the cap, so
  it stays a future option, not M4 work.
- Mark all above is unchanged: it sends the ids of the rows above in the
  loaded list, whether or not they're currently rendered. Virtualization
  changes what is in the DOM, never what is "on the owner's screen" in the
  spec's sense: the loaded, ordered list.

## From the review

- `A` acts on the cursor row wherever it is, even if mouse scrolling has
  taken it off screen. Decided: leave it so; Undo covers a mistake. (The
  options were refusing until the row is shown, or moving the cursor
  with mouse scrolling.)
- Row buttons let go of focus once used. A clicked title kept it, so a
  later Enter opened that row again instead of the cursor's.
- The feed picker lets go of focus after a choice. (Choosing a feed loads
  a new list, which drops focus anyway; this covers anything that
  doesn't.)
- `m`, `A` and `u` wait for the write in flight, as the row buttons do,
  so `u` can't undo an earlier action while a later one is saving.
- However an article closes (its button, `q`, the browser's Back),
  opening it again marks it read again.
- With an article open that isn't in the list, `j` opens the top row and
  `k` does nothing, rather than stepping from a row the owner never
  chose.
- Caps Lock made `j` act as `J`, as in vim. (`J` / `K` are no longer bound.)

## Found by the cloud check

- Adding a feed stored its articles' HTML with a join SQLite ran the
  wrong way round: for every article, a scan of every item. Adding 6,000
  articles took 14 s and held the database the whole time (deployed D1
  too). A `cross join` makes SQLite loop over the items and look each
  article up by index: 6,000 now take about 0.25 s.
- Locally, that long write outlasted the retry for local D1's lock, so
  pages loaded meanwhile failed. The retry now runs for a 10 s budget
  (still dev only).

## Tests

- Unit: the key parser (counts, `gg` / `ga` / `gs`, timeouts, unknown
  keys), the typing and modifier guard, cursor moves (clamping, after
  refresh), feed order for `]` / `[`, and that every binding in the table
  reaches a command.
- D1: the 5,000-row cap and that counts still count everything.
- Playwright: a full triage pass by keyboard (move, open, scroll, next
  article, close, toggle read, `A` with a sync landing in between, undo,
  refresh with the cursor landing, feed and page jumps, `?`), typing in
  the add-feed field never firing a shortcut, a timed-out `g`, and a
  3,000-article feed where the DOM holds only a few dozen rows and `G`
  reaches the last one.
