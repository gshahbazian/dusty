import { cn } from 'cn'
import { useEffect, useState } from 'react'

import type { ArticleRow } from '@dusty/db'

import { RelativeTime } from '../RelativeTime.tsx'
import { articles } from './list-state.ts'

/** How long "Mark N above?" waits for its second tap. */
const CONFIRM_MS = 4000

/**
 * One row of an unread list. A read row stays where it is (dimmed) until
 * the list is refreshed, so nothing moves under the cursor. The list is
 * virtualized: the row is placed at `offset` and measured once drawn.
 *
 * Its buttons let go of focus once used, so a later Enter opens the
 * cursor's row rather than pressing one of them again. "Mark all above"
 * takes two taps, the first saying how many rows it will mark, so it is
 * never done by accident on a touch screen.
 */
export function ArticleListItem({
  row,
  read,
  first,
  open,
  cursor,
  position,
  setSize,
  offset,
  measureRef,
  now,
  showFeed,
  busy,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onMarkAllAbove,
}: {
  row: ArticleRow
  read: boolean
  first: boolean
  open: boolean
  cursor: boolean
  position: number
  setSize: number
  offset: number
  measureRef: (element: HTMLLIElement | null) => void
  now: number
  showFeed: boolean
  busy: boolean
  onOpen: () => void
  onMarkRead: () => void
  onMarkUnread: () => void
  onMarkAllAbove: () => void
}) {
  const title = row.title ?? 'Untitled'
  const above = position - 1
  const [confirming, setConfirming] = useState(false)

  // An unanswered "Mark N above?" goes back after a few seconds.
  useEffect(() => {
    if (!confirming) return

    const reset = setTimeout(() => setConfirming(false), CONFIRM_MS)

    return () => clearTimeout(reset)
  }, [confirming])

  return (
    <li
      ref={measureRef}
      data-index={position - 1}
      data-article-id={row.id}
      data-cursor={cursor ? 'true' : undefined}
      aria-posinset={position}
      aria-setsize={setSize}
      style={{ transform: `translateY(${offset}px)` }}
      className={cn(
        'absolute top-0 left-0 w-full border-b border-neutral-200 px-3 py-3 dark:border-neutral-800',
        read && 'opacity-50',
        open && 'bg-neutral-50 dark:bg-neutral-900',
        cursor &&
          'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-blue-600 dark:before:bg-blue-400'
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.blur()
          onOpen()
        }}
        className="block w-full text-left pointer-coarse:min-h-11"
        aria-current={open ? 'true' : undefined}
      >
        <span className={cn('block break-words', !read && 'font-medium')}>
          <span>{title}</span>
          {read && <span className="sr-only"> (read)</span>}
        </span>
        {row.excerpt !== null && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-neutral-600 dark:text-neutral-400">
            {row.excerpt}
          </span>
        )}
      </button>
      <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-neutral-500">
        {showFeed && <span>{row.feedTitle}</span>}
        <RelativeTime at={row.publishedAt} now={now} label="Published" />
      </div>
      {/*
        Actions get their own line, and the read toggle a fixed width, so
        marking a row never changes its height and moves the rows below.
      */}
      <div className="mt-1 flex gap-1 text-sm">
        {!read && (
          <button
            type="button"
            className="w-28 rounded px-2 py-1 text-left text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
            onClick={(event) => {
              event.currentTarget.blur()
              onMarkRead()
            }}
            disabled={busy}
            aria-label={`Mark ${title} read`}
          >
            Mark read
          </button>
        )}
        {read && (
          <button
            type="button"
            className="w-28 rounded px-2 py-1 text-left text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
            onClick={(event) => {
              event.currentTarget.blur()
              onMarkUnread()
            }}
            disabled={busy}
            aria-label={`Mark ${title} unread`}
          >
            Mark unread
          </button>
        )}
        {!first && !confirming && (
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label={`Mark all above ${title} as read`}
          >
            Mark all above as read
          </button>
        )}
        {!first && confirming && (
          <button
            type="button"
            className="rounded bg-neutral-900 px-2 py-1 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 pointer-coarse:min-h-11"
            onClick={(event) => {
              event.currentTarget.blur()
              setConfirming(false)
              onMarkAllAbove()
            }}
            disabled={busy}
            aria-label={`Confirm: mark ${articles(above)} above ${title} as read`}
          >
            Mark {above} above?
          </button>
        )}
      </div>
    </li>
  )
}
