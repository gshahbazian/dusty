import { cn } from 'cn'
import { useEffect, useState } from 'react'

import type { ArticleRow } from '@dusty/db'

import { Button } from '@/components/ui/button.tsx'

import { RelativeTime } from '../relative-time.tsx'
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
        'absolute top-0 left-0 w-full border-b px-3 py-3',
        read && 'opacity-50',
        open && 'bg-muted',
        cursor &&
          'before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary'
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
          <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs">
            {row.excerpt}
          </span>
        )}
      </button>
      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
        {showFeed && <span>{row.feedTitle}</span>}
        <RelativeTime at={row.publishedAt} now={now} label="Published" />
      </div>
      {/*
        Actions get their own line, and the read toggle a fixed width, so
        marking a row never changes its height and moves the rows below.
      */}
      <div className="mt-1 -ml-2 flex gap-1">
        {!read && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-24 justify-start"
            onClick={(event) => {
              event.currentTarget.blur()
              onMarkRead()
            }}
            disabled={busy}
            aria-label={`Mark ${title} read`}
          >
            Mark read
          </Button>
        )}
        {read && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-24 justify-start"
            onClick={(event) => {
              event.currentTarget.blur()
              onMarkUnread()
            }}
            disabled={busy}
            aria-label={`Mark ${title} unread`}
          >
            Mark unread
          </Button>
        )}
        {!first && !confirming && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label={`Mark all above ${title} as read`}
          >
            Mark all above as read
          </Button>
        )}
        {!first && confirming && (
          <Button
            size="sm"
            onClick={(event) => {
              event.currentTarget.blur()
              setConfirming(false)
              onMarkAllAbove()
            }}
            disabled={busy}
            aria-label={`Confirm: mark ${articles(above)} above ${title} as read`}
          >
            Mark {above} above?
          </Button>
        )}
      </div>
    </li>
  )
}
