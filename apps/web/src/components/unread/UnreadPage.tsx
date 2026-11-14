import { cn } from 'cn'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'

import type { ArticleRow, FeedCount } from '@dusty/db'

import { syncForRefresh } from '../../server/functions.ts'
import { useCommands } from '../keyboard/KeyboardShortcuts.tsx'
import type { Command } from '../keyboard/keymap.ts'
import { RelativeTime } from '../RelativeTime.tsx'
import { ArticleListItem } from './ArticleListItem.tsx'
import { ArticleView } from './ArticleView.tsx'
import {
  cursorIndex,
  feedFromPath,
  moveCursor,
  neighborFeed,
} from './cursor.ts'
import { adjustedCounts, type Counts } from './list-state.ts'
import { useUnreadList, type Notice } from './useUnreadList.ts'

export interface UnreadListData {
  readonly rows: readonly ArticleRow[]
  readonly counts: readonly FeedCount[]
  readonly snapshotAt: number
  /** The list stopped at the most rows one list loads. */
  readonly truncated: boolean
}

/**
 * An unread list (all feeds, or one): the articles in a sidebar, and the
 * open article beside them. Keyed by the snapshot, so a refresh starts from
 * the new list's state. The cursor lives out here, so after a refresh it
 * lands on the same article if the new list still has it.
 */
export function UnreadPage({
  data,
  feedId,
  articleId,
  onOpenArticle,
}: {
  data: UnreadListData
  feedId: number | null
  articleId: number | null
  onOpenArticle: (id: number | null) => void
}) {
  const [cursorId, setCursorId] = useState<number | null>(articleId)

  // The article already marked read for being opened. A refresh shows it
  // again without opening it again, so a "mark unread" made while reading
  // it stays unread. Closing it clears this: opening it again reads it.
  const [readOnOpen, setReadOnOpen] = useState<number | null>(null)
  const [shownArticle, setShownArticle] = useState(articleId)

  // However the article closes (its button, `q`, the browser's Back), the
  // next open reads it again.
  if (articleId !== shownArticle) {
    setShownArticle(articleId)

    if (articleId === null) setReadOnOpen(null)
  }

  return (
    <UnreadSnapshot
      key={data.snapshotAt}
      data={data}
      feedId={feedId}
      articleId={articleId}
      cursorId={cursorId}
      onCursor={setCursorId}
      readOnOpen={readOnOpen}
      onReadOnOpen={setReadOnOpen}
      onOpenArticle={onOpenArticle}
    />
  )
}

/** Room kept above and below the cursor's row (the toast sits below). */
const REVEAL_TOP_PX = 8
const REVEAL_BOTTOM_PX = 72

/** How far the arrow keys scroll an open article, per press. */
const ARTICLE_STEP_PX = 64

function UnreadSnapshot({
  data,
  feedId,
  articleId,
  cursorId,
  onCursor,
  readOnOpen,
  onReadOnOpen,
  onOpenArticle,
}: {
  data: UnreadListData
  feedId: number | null
  articleId: number | null
  cursorId: number | null
  onCursor: (id: number) => void
  readOnOpen: number | null
  onReadOnOpen: (id: number) => void
  onOpenArticle: (id: number | null) => void
}) {
  const { rows } = data
  const list = useUnreadList(rows, data.snapshotAt)
  const counts = adjustedCounts(data.counts, rows, list.overrides)
  const [now] = useState(() => Date.now())
  const { refreshing, refresh } = useRefresh(list.fail)
  const navigate = useNavigate()
  const router = useRouter()
  const articleScroll = useRef<HTMLElement>(null)
  const { listScroll, virtualizer, reveal } = useVirtualRows(rows)

  const feeds = counts.byFeed.filter(
    (count) => count.unread > 0 || count.feedId === feedId
  )

  const cursor = cursorIndex(rows, cursorId)
  const articleOpen = articleId !== null

  const neighbors = articleNeighbors(rows, cursor, articleId, (index) =>
    open(index)
  )

  // After a refresh (or opening a link to an article), bring the cursor's
  // row into view once.
  useEffect(() => {
    if (cursor > 0) reveal(cursor)
    // Only when the snapshot first shows.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Said by screen readers when the cursor moves by key.
  const [announcement, setAnnouncement] = useState('')

  /** Move the cursor, scrolling just enough to keep its row in view. */
  const moveTo = (index: number) => {
    const row = rows[index]

    if (row === undefined) return

    onCursor(row.id)
    reveal(index)
    setAnnouncement(
      `${index + 1} of ${rows.length}: ${row.title ?? 'Untitled'}`
    )
  }

  const open = (index: number) => {
    const row = rows[index]

    if (row === undefined) return

    onCursor(row.id)
    reveal(index)
    onOpenArticle(row.id)
  }

  const goToFeed = (id: number | null) => {
    if (id === null) {
      void navigate({ to: '/' })

      return
    }

    void navigate({ to: '/feeds/$feedId', params: { feedId: String(id) } })
  }

  // Built when a key is pressed, so every command sees current state.
  useCommands((command, count) => {
    const run = commandsFor({
      rows,
      cursor,
      openId: articleId,
      list,
      moveTo,
      open,
      refresh: () => void refresh(),
      close: () => onOpenArticle(null),
      goToFeed: (direction) => {
        const order = [null, ...feeds.map((feed) => feed.feedId)]
        // From where the router is going, not this page's feed: a second
        // `]` pressed before the next list loads still moves on from it.
        const current = feedFromPath(router.latestLocation.pathname)
        const next = neighborFeed(order, current, direction)

        if (next !== undefined) goToFeed(next)
      },
      scrollArticle: (pixels) =>
        articleScroll.current?.scrollBy({ top: pixels }),
      articleHeight: () => articleScroll.current?.clientHeight ?? 0,
      halfPage: (direction) => {
        const element = listScroll.current

        if (element === null) return

        const half = (element.clientHeight / 2) * direction
        const start = virtualizer.measurementsCache[cursor]?.start ?? 0
        const target = virtualizer.getVirtualItemForOffset(start + half)

        // The list moves with the cursor, so its row stays about where it
        // was; then make sure all of it shows.
        element.scrollBy({ top: half })
        moveTo(target?.index ?? (direction === 1 ? rows.length - 1 : 0))
      },
    })[command]

    if (run === undefined) return false

    run(count)

    return true
  })

  return (
    <div className="flex h-full">
      <aside
        aria-label="Articles"
        className={cn(
          'flex w-full flex-col border-r border-neutral-200 lg:w-96 lg:shrink-0 dark:border-neutral-800',
          articleOpen && 'hidden lg:flex'
        )}
      >
        <div className="flex flex-col gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
          <select
            aria-label="Feed"
            value={feedId ?? ''}
            onChange={(event) => {
              // Let go of the keyboard, or the next `j` would pick a feed.
              event.currentTarget.blur()
              goToFeed(
                event.target.value === '' ? null : Number(event.target.value)
              )
            }}
            className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700 pointer-coarse:min-h-11"
          >
            <option value="">All unread ({counts.total})</option>
            {feeds.map((feed) => (
              <option key={feed.feedId} value={feed.feedId}>
                {feed.title} ({feed.unread})
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-semibold">
              {listTitle(feedId, counts)}{' '}
              <span className="font-normal text-neutral-500">
                {countFor(feedId, counts)} unread
              </span>
            </h1>
            <RefreshButton
              snapshotAt={data.snapshotAt}
              now={now}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          </div>
          {data.truncated && (
            <p className="text-sm text-neutral-500">
              Showing the first {rows.length.toLocaleString('en-US')}. Refresh
              after clearing these to load more.
            </p>
          )}
        </div>

        {rows.length === 0 && (
          <p className="p-3 text-neutral-500">
            Nothing unread. Refresh to check for new articles.
          </p>
        )}

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div ref={listScroll} className="min-h-0 flex-1 overflow-y-auto">
          <ul
            aria-label="Unread articles"
            className="relative"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]

              if (row === undefined) return null

              return (
                <ArticleListItem
                  key={row.id}
                  row={row}
                  read={list.isRead(row.id)}
                  first={item.index === 0}
                  open={articleId === row.id}
                  cursor={item.index === cursor}
                  position={item.index + 1}
                  setSize={rows.length}
                  offset={item.start}
                  measureRef={virtualizer.measureElement}
                  now={now}
                  showFeed={feedId === null}
                  busy={list.busy}
                  onOpen={() => open(item.index)}
                  onMarkRead={() => void list.markOneRead(row.id)}
                  onMarkUnread={() => void list.markOneUnread(row.id)}
                  onMarkAllAbove={() => void list.markAllAbove(row.id)}
                />
              )
            })}
          </ul>
        </div>
      </aside>

      <section
        ref={articleScroll}
        aria-label="Article content"
        className={cn(
          'min-w-0 flex-1 overflow-y-auto',
          !articleOpen && 'hidden lg:block'
        )}
      >
        {articleId !== null && (
          <ArticleView
            articleId={articleId}
            read={list.isRead(articleId)}
            onOpened={(id, alreadyRead) => {
              // Shown again by a refresh, and unread now: leave it so.
              if (id === readOnOpen && !alreadyRead) return

              onReadOnOpen(id)
              void list.markOpenedRead(id, alreadyRead)
            }}
            onMarkUnread={(id) => void list.markOneUnread(id)}
            onPrevious={neighbors.previous}
            onNext={neighbors.next}
            onClose={() => onOpenArticle(null)}
          />
        )}
        {articleId === null && rows.length > 0 && (
          <p className="p-8 text-center text-neutral-500">
            Choose an article to read it here.
          </p>
        )}
      </section>

      <NoticeBar
        aboveBar={articleOpen}
        notice={list.notice}
        busy={list.busy}
        onUndo={list.undo}
        onDismiss={list.dismissNotice}
      />
    </div>
  )
}

/**
 * Previous and Next for an open article, as `k` / `j` do: the rows either
 * side of it, or, if it isn't in the list (opened from a link), the top row
 * as next and nothing as previous.
 */
interface Neighbors {
  readonly previous: (() => void) | null
  readonly next: (() => void) | null
}

function articleNeighbors(
  rows: readonly ArticleRow[],
  cursor: number,
  openId: number | null,
  open: (index: number) => void
): Neighbors {
  if (openId === null || rows.length === 0) {
    return { previous: null, next: null }
  }

  if (rows[cursor]?.id !== openId) {
    return { previous: null, next: () => open(0) }
  }

  return {
    previous: cursor > 0 ? () => open(cursor - 1) : null,
    next: cursor < rows.length - 1 ? () => open(cursor + 1) : null,
  }
}

type UnreadList = ReturnType<typeof useUnreadList>

type Commands = Partial<Record<Command, (count: number) => void>>

/** What each command does on this list, given where the cursor is. */
function commandsFor(page: {
  rows: readonly ArticleRow[]
  cursor: number
  /** The open article, if any: `m` acts on it (it may not be in the list). */
  openId: number | null
  list: UnreadList
  moveTo: (index: number) => void
  open: (index: number) => void
  refresh: () => void
  close: () => void
  goToFeed: (direction: 1 | -1) => void
  scrollArticle: (pixels: number) => void
  articleHeight: () => number
  halfPage: (direction: 1 | -1) => void
}): Commands {
  const { rows, cursor, list } = page
  const articleOpen = page.openId !== null
  const row = rows[cursor]

  const always: Commands = {
    refresh: page.refresh,
    undo: list.undoLast,
    nextFeed: () => page.goToFeed(1),
    previousFeed: () => page.goToFeed(-1),
    ...(articleOpen && { close: page.close }),
  }

  if (row === undefined) return always

  /** Arrow keys: scroll an open article, else move the cursor. */
  const scroll = (delta: number) => {
    if (articleOpen) {
      page.scrollArticle(ARTICLE_STEP_PX * delta)

      return
    }

    page.moveTo(moveCursor(cursor, delta, rows.length))
  }

  /**
   * `j` / `k`: move the cursor; with an article open, open the next (or
   * previous) one in its place. If the open article isn't in the list
   * (opened from a link), `j` starts at the top and `k` has nowhere to go.
   */
  const step = (delta: number) => {
    if (articleOpen && row.id !== page.openId) {
      if (delta > 0) page.open(0)

      return
    }

    const index = moveCursor(cursor, delta, rows.length)

    if (articleOpen) {
      page.open(index)

      return
    }

    page.moveTo(index)
  }

  /**
   * Marking waits for the last write to finish, as the row buttons do, so
   * `u` can't undo an earlier action while a later one is still saving.
   */
  const whenIdle = (write: () => void) => () => {
    if (!list.busy) write()
  }

  /**
   * `Ctrl-d` / `Ctrl-u` (half a page) and Space / Shift-Space (most of a
   * page) scroll an open article; on the list, both move half a page.
   */
  const pageBy = (direction: 1 | -1, share: number) => {
    if (articleOpen) {
      page.scrollArticle(page.articleHeight() * share * direction)

      return
    }

    page.halfPage(direction)
  }

  return {
    ...always,
    down: (count) => step(count),
    up: (count) => step(-count),
    scrollDown: (count) => scroll(count),
    scrollUp: (count) => scroll(-count),
    first: () => page.moveTo(0),
    last: () => page.moveTo(rows.length - 1),
    halfPageDown: () => pageBy(1, 0.5),
    halfPageUp: () => pageBy(-1, 0.5),
    pageDown: () => pageBy(1, 0.9),
    pageUp: () => pageBy(-1, 0.9),
    open: () => page.open(cursor),
    openOriginal: () => {
      if (row.url === null) {
        list.say('This article has no original page.')

        return
      }

      window.open(row.url, '_blank', 'noopener,noreferrer')
    },
    undo: whenIdle(list.undoLast),
    toggleRead: whenIdle(() => {
      const id = page.openId ?? row.id

      if (list.isRead(id)) {
        void list.markOneUnread(id)

        return
      }

      void list.markOneRead(id)
    }),
    markAllAbove: whenIdle(() => {
      if (cursor === 0) {
        list.say('Nothing above this row.')

        return
      }

      void list.markAllAbove(row.id)
    }),
  }
}

/**
 * Draw only the rows in view of the sidebar, so thousands of them cost a
 * few dozen DOM nodes.
 */
function useVirtualRows(rows: readonly ArticleRow[]) {
  const listScroll = useRef<HTMLDivElement>(null)

  // TanStack Virtual hands back functions the React Compiler can't memoize;
  // the compiler skips this hook, which is what it needs.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listScroll.current,
    estimateSize: () => 120,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
  })

  /**
   * Scroll just enough to show a row. Measured against the live scroll
   * position: the virtualizer's own lags a frame behind, and its 'auto'
   * alignment would scroll back to it. A row not drawn yet (a far jump) is
   * left to the virtualizer, which measures as it goes.
   */
  const reveal = (index: number) => {
    const element = listScroll.current

    if (element === null) return

    const drawn = virtualizer
      .getVirtualItems()
      .some((item) => item.index === index)

    const item = virtualizer.measurementsCache[index]

    if (!drawn || item === undefined) {
      virtualizer.scrollToIndex(index, { align: 'center' })

      return
    }

    const top = element.scrollTop + REVEAL_TOP_PX
    const bottom = element.scrollTop + element.clientHeight - REVEAL_BOTTOM_PX

    if (item.start < top) {
      element.scrollTo({ top: item.start - REVEAL_TOP_PX })

      return
    }

    if (item.end > bottom) {
      element.scrollTo({
        top: item.end - element.clientHeight + REVEAL_BOTTOM_PX,
      })
    }
  }

  return { listScroll, virtualizer, reveal }
}

/**
 * Run the sync, wait for it, then reload the list and counts, so what it
 * fetched shows at once. A sync that ran a few minutes ago is skipped and
 * returns at once; a running one takes at most its on-demand budget. If the
 * sync can't be reached, say so and leave the list as it is.
 */
function useRefresh(onFailed: (text: string) => void) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    if (refreshing) return

    setRefreshing(true)

    try {
      await syncForRefresh()
    } catch {
      setRefreshing(false)
      onFailed("Couldn't check the feeds. The list is unchanged; try again.")

      return
    }

    try {
      await router.invalidate()
    } finally {
      setRefreshing(false)
    }
  }

  return { refreshing, refresh }
}

function listTitle(feedId: number | null, counts: Counts): string {
  if (feedId === null) return 'All unread'

  const feed = counts.byFeed.find((count) => count.feedId === feedId)

  return feed?.title ?? 'Feed not found'
}

const countFor = (feedId: number | null, counts: Counts): number => {
  if (feedId === null) return counts.total

  return counts.byFeed.find((count) => count.feedId === feedId)?.unread ?? 0
}

/**
 * Reload the list and counts, and ask the sync service to run (skipped if
 * one ran in the last few minutes). Shows when the data was last loaded.
 */
function RefreshButton({
  snapshotAt,
  now,
  refreshing,
  onRefresh,
}: {
  snapshotAt: number
  now: number
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500">
      {!refreshing && (
        <span>
          Updated <RelativeTime at={snapshotAt} now={now} label="Updated" />
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded border border-neutral-300 px-2 py-0.5 disabled:opacity-50 dark:border-neutral-700 pointer-coarse:min-h-11"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}

/** Marked, undone or failed: a toast, so it never moves the list. */
function NoticeBar({
  aboveBar,
  notice,
  busy,
  onUndo,
  onDismiss,
}: {
  /** An article's action bar is at the bottom of a phone's screen. */
  aboveBar: boolean
  notice: Notice | null
  busy: boolean
  onUndo: (actionId: string) => void
  onDismiss: () => void
}) {
  if (notice === null) return <output aria-live="polite" className="sr-only" />

  return (
    <output
      aria-live="polite"
      className={cn(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded border px-3 py-2 text-sm shadow',
        aboveBar && 'max-lg:bottom-24',
        notice.kind === 'error' &&
          'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
        notice.kind !== 'error' &&
          'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      )}
    >
      <span className="flex-1">{notice.text}</span>
      {notice.kind === 'marked' && (
        <button
          type="button"
          onClick={() => onUndo(notice.actionId)}
          disabled={busy}
          className="font-medium underline disabled:opacity-50 pointer-coarse:min-h-11"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-neutral-500 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        ×
      </button>
    </output>
  )
}
