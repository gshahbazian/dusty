import { cn } from 'cn'
import {
  BookOpenIcon,
  CheckCheckIcon,
  CheckIcon,
  CircleDotIcon,
  ExternalLinkIcon,
} from 'lucide-react'

import type { ArticleRow } from '@dusty/db'

import { Button } from '#/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'

import { RelativeTime } from '#/components/relative-time'
import { articles } from '#/components/unread/list-state'
import { openInNewTab } from '#/lib/open-in-new-tab'

/**
 * What a row can do, the same for every row: passed as one object, so a new
 * row action is added in one place.
 */
export interface RowActions {
  /** A write is in flight: the marking actions wait. */
  readonly busy: boolean
  readonly isRead: (id: number) => boolean
  /** Open the article at this place in the list. */
  readonly open: (index: number) => void
  readonly markRead: (id: number) => void
  readonly markUnread: (id: number) => void
  readonly markAllAbove: (id: number) => void
}

/**
 * One row of an unread list. A read row stays where it is (dimmed) until
 * the list is refreshed, so nothing moves under the cursor. The list is
 * virtualized: the row is placed at `offset` and measured once drawn.
 *
 * Its buttons let go of focus once used, so a later Enter opens the
 * cursor's row rather than pressing one of them again. "Mark all above"
 * takes two taps, the first saying how many rows it will mark, so it is
 * never done by accident on a touch screen. Which row is asking is kept by
 * the list: one at a time.
 */
export function ArticleListItem({
  row,
  index,
  setSize,
  offset,
  measureRef,
  open,
  cursor,
  now,
  showFeed,
  confirming,
  onAskAbove,
  actions,
}: {
  row: ArticleRow
  /** Its place in the list, from 0. */
  index: number
  setSize: number
  offset: number
  measureRef: (element: HTMLLIElement | null) => void
  open: boolean
  cursor: boolean
  now: number
  showFeed: boolean
  /** Asking "Mark N above?" (the list keeps which row, one at a time). */
  confirming: boolean
  /** The first tap of "mark all above": start asking. */
  onAskAbove: () => void
  actions: RowActions
}) {
  const title = row.title ?? 'Untitled'
  const position = index + 1
  const above = index
  const first = index === 0
  const read = actions.isRead(row.id)
  const { busy } = actions
  const onOpen = () => actions.open(index)
  const onMarkAllAbove = () => actions.markAllAbove(row.id)

  const toggleRead = () => {
    if (read) {
      actions.markUnread(row.id)

      return
    }

    actions.markRead(row.id)
  }

  return (
    <ContextMenu>
      {/* Right-click a row for its actions (the trigger is the row itself). */}
      <ContextMenuTrigger
        render={<li ref={measureRef} />}
        data-index={index}
        data-article-id={row.id}
        data-cursor={cursor ? 'true' : undefined}
        aria-posinset={position}
        aria-setsize={setSize}
        style={{ transform: `translateY(${offset}px)` }}
        className={cn(
          'hover:bg-muted/50 absolute top-0 left-0 w-full border-b px-3 py-3',
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
          // Stretched over the whole row, so a click anywhere opens it; the
          // row's other controls sit above this layer.
          className="focus-visible:after:ring-ring block w-full text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset pointer-coarse:min-h-11"
          aria-current={open ? 'true' : undefined}
        >
          {/* Same weight read or unread: a bolder title wraps differently and
            would change the row's height. Read rows are dimmed instead. */}
          <span className="block font-medium break-words">
            <span>{title}</span>
            {read && <span className="sr-only"> (read)</span>}
          </span>
          {row.excerpt !== null && (
            <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
              {row.excerpt}
            </span>
          )}
        </button>
        <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
          {showFeed && <span>{row.feedTitle}</span>}
          <RelativeTime
            at={row.publishedAt}
            now={now}
            className="relative z-10"
          />
        </div>
        {/*
        Actions get their own line, and both read toggles are the same size,
        so marking a row never changes its height and moves the rows below.
      */}
        <div className="mt-1 -ml-2 flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground relative z-10 pointer-coarse:min-w-11"
            onClick={(event) => {
              event.currentTarget.blur()
              toggleRead()
            }}
            disabled={busy}
            aria-label={read ? `Mark ${title} unread` : `Mark ${title} read`}
            title={read ? 'Mark unread' : 'Mark read'}
          >
            {read ? <CircleDotIcon /> : <CheckIcon />}
          </Button>
          {!first && !confirming && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground relative z-10 pointer-coarse:min-w-11"
              onClick={onAskAbove}
              disabled={busy}
              aria-label={`Mark all above ${title} as read`}
              title="Mark all above as read"
            >
              <CheckCheckIcon />
            </Button>
          )}
          {!first && confirming && (
            <Button
              size="sm"
              className="relative z-10"
              onClick={(event) => {
                event.currentTarget.blur()
                onMarkAllAbove()
              }}
              disabled={busy}
              aria-label={`Confirm: mark ${articles(above)} above ${title} as read`}
            >
              Mark {above} above?
            </Button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        <ContextMenuItem onClick={onOpen}>
          <BookOpenIcon />
          Open
          <ContextMenuShortcut>↵</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={row.url === null}
          onClick={() => {
            if (row.url !== null) openInNewTab(row.url)
          }}
        >
          <ExternalLinkIcon />
          Open page in new tab
          <ContextMenuShortcut>o</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onClick={toggleRead}>
          {read ? <CircleDotIcon /> : <CheckIcon />}
          {read ? 'Mark unread' : 'Mark read'}
          <ContextMenuShortcut>m</ContextMenuShortcut>
        </ContextMenuItem>
        {/* Chosen from a menu, so no second "are you sure?" step. */}
        <ContextMenuItem disabled={busy || first} onClick={onMarkAllAbove}>
          <CheckCheckIcon />
          Mark all above as read
          <ContextMenuShortcut>A</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
