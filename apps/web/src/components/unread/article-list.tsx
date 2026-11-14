import { measureElement, useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'

import type { ArticleRow } from '@dusty/db'

import { ArticleListItem } from './article-list-item.tsx'

/** A row's height before it is measured. */
const ESTIMATED_ROW_PX = 120

/** Where the list sits beside the article; below it, the article replaces it. */
const WIDE_SCREEN = '(min-width: 64rem)'

/** Room kept above and below the cursor's row (the toast sits below). */
const REVEAL_TOP_PX = 8
const REVEAL_BOTTOM_PX = 72

/** What the page asks of the list: scrolling it for the keyboard. */
export interface ArticleListHandle {
  /** Scroll just enough to show a row. */
  readonly reveal: (index: number) => void
  /**
   * Scroll half a page from a row, and return the row now about where it
   * was, so the cursor can move with the list.
   */
  readonly halfPage: (from: number, direction: 1 | -1) => number
}

/**
 * The sidebar's rows, virtualized: only the rows in view (and a few either
 * side) are drawn, so thousands of them cost a few dozen DOM nodes.
 *
 * The virtualizer's scroll state lives here, so scrolling re-renders the
 * list alone, never the page or the open article.
 */
export function ArticleList({
  ref,
  listKey,
  rows,
  cursor,
  openId,
  now,
  showFeed,
  busy,
  isRead,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onMarkAllAbove,
}: {
  ref: Ref<ArticleListHandle>
  /** Which list (feed, unread or all): another one starts at its top. */
  listKey: string
  rows: readonly ArticleRow[]
  cursor: number
  openId: number | null
  now: number
  showFeed: boolean
  busy: boolean
  isRead: (id: number) => boolean
  onOpen: (index: number) => void
  onMarkRead: (id: number) => void
  onMarkUnread: (id: number) => void
  onMarkAllAbove: (id: number) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)

  // TanStack Virtual hands back functions the React Compiler can't memoize;
  // the compiler skips this hook, which is what it needs.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
    // On a phone the list is hidden (display: none) while an article is
    // open, and its rows then measure 0 high. Keep their real heights, or
    // every row's position is wrong when the list comes back.
    measureElement: (element, entry, instance) => {
      const size = measureElement(element, entry, instance)

      if (size > 0) return size

      const index = instance.indexFromElement(element)

      return instance.measurementsCache[index]?.size ?? ESTIMATED_ROW_PX
    },
  })

  // Back from an article on a phone (the list was hidden behind it): that
  // article's row, which has the cursor, starts the list. After a frame, so
  // the list is laid out again and the router's own scroll restoration for
  // the navigation has run.
  const previousOpenId = useRef(openId)

  useEffect(() => {
    const closed = previousOpenId.current !== null && openId === null

    previousOpenId.current = openId

    if (!closed || matchMedia(WIDE_SCREEN).matches) return

    const frame = requestAnimationFrame(() =>
      virtualizer.scrollToIndex(cursor, { align: 'start' })
    )

    return () => cancelAnimationFrame(frame)
    // Only when the open article changes; `cursor` is read as it is then.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  useImperativeHandle(ref, () => ({
    /**
     * Measured against the live scroll position: the virtualizer's own lags
     * a frame behind, and its 'auto' alignment would scroll back to it. A
     * row not drawn yet (a far jump) is left to the virtualizer, which
     * measures as it goes.
     */
    reveal: (index) => {
      const element = scroller.current

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
    },

    halfPage: (from, direction) => {
      const element = scroller.current
      const last = direction === 1 ? rows.length - 1 : 0

      if (element === null) return last

      const half = (element.clientHeight / 2) * direction
      const start = virtualizer.measurementsCache[from]?.start ?? 0
      const target = virtualizer.getVirtualItemForOffset(start + half)

      element.scrollBy({ top: half })

      return target?.index ?? last
    },
  }))

  return (
    // The router remembers scroll positions per element across navigations.
    // Named per list, opening an article keeps this list where it is, and
    // another feed (or unread / all) never inherits its position.
    <div
      ref={scroller}
      data-scroll-restoration-id={`list-${listKey}`}
      className="min-h-0 flex-1 overflow-y-auto"
    >
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
              read={isRead(row.id)}
              first={item.index === 0}
              open={openId === row.id}
              cursor={item.index === cursor}
              position={item.index + 1}
              setSize={rows.length}
              offset={item.start}
              measureRef={virtualizer.measureElement}
              now={now}
              showFeed={showFeed}
              busy={busy}
              onOpen={() => onOpen(item.index)}
              onMarkRead={() => onMarkRead(row.id)}
              onMarkUnread={() => onMarkUnread(row.id)}
              onMarkAllAbove={() => onMarkAllAbove(row.id)}
            />
          )
        })}
      </ul>
    </div>
  )
}
