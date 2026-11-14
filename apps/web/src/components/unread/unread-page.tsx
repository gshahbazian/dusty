import { cn } from 'cn'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import type { ArticleRow, FeedCount, ListShow } from '@dusty/db'

import { syncForRefresh } from '../../server/functions.ts'
import { useCommands } from '../keyboard/keyboard-shortcuts.tsx'
import type { Command } from '../keyboard/keymap.ts'
import { ArticleList, type ArticleListHandle } from './article-list.tsx'
import { ArticleView } from './article-view.tsx'
import {
  cursorIndex,
  feedFromPath,
  moveCursor,
  neighborFeed,
} from './cursor.ts'
import { ListHeader } from './list-header.tsx'
import { adjustedCounts } from './list-state.ts'
import { EmptyPane } from './empty-pane.tsx'
import { MobileArticleBar } from './mobile-article-bar.tsx'
import { NoticeBar } from './notice-bar.tsx'
import { useUnreadList } from './use-unread-list.ts'

/** Whether a feed's page lists its unread or all articles, and switching. */
export interface ListShowControl {
  readonly show: ListShow
  readonly onChange: (show: ListShow) => void
}

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
  listShow,
  articleId,
  onOpenArticle,
}: {
  data: UnreadListData
  feedId: number | null
  /** A feed's page: whether it shows unread or all articles, and switching. */
  listShow?: ListShowControl
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
      listShow={listShow}
      articleId={articleId}
      cursorId={cursorId}
      onCursor={setCursorId}
      readOnOpen={readOnOpen}
      onReadOnOpen={setReadOnOpen}
      onOpenArticle={onOpenArticle}
    />
  )
}

/** How far the arrow keys scroll an open article, per press. */
const ARTICLE_STEP_PX = 64

function UnreadSnapshot({
  data,
  feedId,
  listShow,
  articleId,
  cursorId,
  onCursor,
  readOnOpen,
  onReadOnOpen,
  onOpenArticle,
}: {
  data: UnreadListData
  feedId: number | null
  listShow: ListShowControl | undefined
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

  const listRef = useRef<ArticleListHandle>(null)
  const reveal = (index: number) => listRef.current?.reveal(index)

  // Every feed, caught up or not: a feed's page can show its read
  // articles too.
  const feeds = counts.byFeed

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
        const target = listRef.current?.halfPage(cursor, direction)

        // The list moves with the cursor, so its row stays about where it
        // was; then make sure all of it shows.
        if (target !== undefined) moveTo(target)
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
          'flex w-full flex-col border-r lg:w-96 lg:shrink-0',
          articleOpen && 'hidden lg:flex'
        )}
      >
        <ListHeader
          feedId={feedId}
          listShow={listShow}
          counts={counts}
          feeds={feeds}
          snapshotAt={data.snapshotAt}
          now={now}
          shown={rows.length}
          truncated={data.truncated}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          onPickFeed={goToFeed}
        />

        {/* An empty list is just empty: the picker's count says (0), and the
            screen-reader heading says "0 unread". */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <ArticleList
          ref={listRef}
          rows={rows}
          cursor={cursor}
          openId={articleId}
          now={now}
          showFeed={feedId === null}
          busy={list.busy}
          isRead={list.isRead}
          onOpen={open}
          onMarkRead={(id) => void list.markOneRead(id)}
          onMarkUnread={(id) => void list.markOneUnread(id)}
          onMarkAllAbove={(id) => void list.markAllAbove(id)}
        />
      </aside>

      {/* The router scrolls this to the top on every navigation (router.tsx),
          so each article opens at its top. */}
      <section
        ref={articleScroll}
        id="article-pane"
        aria-label="Article content"
        className={cn(
          'min-w-0 flex-1 overflow-y-auto',
          !articleOpen && 'hidden lg:block'
        )}
      >
        {articleId !== null && (
          <ArticleView
            articleId={articleId}
            onOpened={(id, alreadyRead) => {
              // Shown again by a refresh, and unread now: leave it so.
              if (id === readOnOpen && !alreadyRead) return

              onReadOnOpen(id)
              void list.markOpenedRead(id, alreadyRead)
            }}
          />
        )}
        {articleId !== null && (
          <MobileArticleBar
            read={list.isRead(articleId)}
            onBack={() => onOpenArticle(null)}
            onPrevious={neighbors.previous}
            onNext={neighbors.next}
            onMarkUnread={() => void list.markOneUnread(articleId)}
          />
        )}
        {articleId === null && <EmptyPane />}
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
