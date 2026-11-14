import { cn } from 'cn'
import type { ArticleRow } from '@dusty/db'

import { RelativeTime } from '../RelativeTime.tsx'

/**
 * One row of an unread list. A read row stays where it is (dimmed) until
 * the list is refreshed, so nothing moves under the cursor.
 */
export function ArticleListItem({
  row,
  read,
  first,
  open,
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
  now: number
  showFeed: boolean
  busy: boolean
  onOpen: () => void
  onMarkRead: () => void
  onMarkUnread: () => void
  onMarkAllAbove: () => void
}) {
  const title = row.title ?? 'Untitled'

  return (
    <li
      data-article-id={row.id}
      className={cn(
        'border-b border-neutral-200 py-3 dark:border-neutral-800',
        read && 'opacity-50',
        open && 'bg-neutral-50 dark:bg-neutral-900'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
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
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
        {showFeed && <span>{row.feedTitle}</span>}
        <RelativeTime at={row.publishedAt} now={now} label="Published" />
        <span className="flex flex-wrap gap-1">
          {!read && (
            <button
              type="button"
              className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              onClick={onMarkRead}
              disabled={busy}
              aria-label={`Mark ${title} read`}
            >
              Mark read
            </button>
          )}
          {read && (
            <button
              type="button"
              className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              onClick={onMarkUnread}
              disabled={busy}
              aria-label={`Mark ${title} unread`}
            >
              Mark unread
            </button>
          )}
          {!first && (
            <button
              type="button"
              className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              onClick={onMarkAllAbove}
              disabled={busy}
              aria-label={`Mark all above ${title} as read`}
            >
              Mark all above as read
            </button>
          )}
        </span>
      </div>
    </li>
  )
}
