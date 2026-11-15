import { cn } from 'cn'
import { RefreshCwIcon } from 'lucide-react'

import type { FeedCount } from '@dusty/db'

import { Button } from '#/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'

import { RelativeTime } from '#/components/relative-time'
import type { Counts } from '#/components/unread/list-state'
import type { ListShowControl } from '#/components/unread/unread-page'

/**
 * The top of the sidebar: the feed picker (which names the list and its
 * count), on a feed's page whether to show its unread or all articles,
 * when the list was loaded (or, once a sync has stored more, a link that
 * loads them), and Refresh.
 */
export function ListHeader({
  feedId,
  listShow,
  counts,
  feeds,
  snapshotAt,
  now,
  shown,
  truncated,
  refreshing,
  onRefresh,
  newArticlesReady,
  onShowNewArticles,
  onPickFeed,
}: {
  feedId: number | null
  /** A feed's page: unread or all, and switching. Absent on All unread. */
  listShow: ListShowControl | undefined
  counts: Counts
  /** The feeds to offer: those with unread articles, and this one. */
  feeds: readonly FeedCount[]
  snapshotAt: number
  now: number
  /** How many rows the list shows. */
  shown: number
  truncated: boolean
  refreshing: boolean
  onRefresh: () => void
  /** A sync stored articles this list doesn't have yet. */
  newArticlesReady: boolean
  onShowNewArticles: () => void
  onPickFeed: (feedId: number | null) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-b p-3">
      <NativeSelect
        aria-label="Feed"
        value={feedId ?? ''}
        onChange={(event) => {
          // Let go of the keyboard, or the next `j` would pick a feed.
          event.currentTarget.blur()
          onPickFeed(
            event.target.value === '' ? null : Number(event.target.value)
          )
        }}
        className="w-full"
      >
        <NativeSelectOption value="">
          All unread ({counts.total})
        </NativeSelectOption>
        {feeds.map((feed) => (
          <NativeSelectOption key={feed.feedId} value={feed.feedId}>
            {feed.title} ({feed.unread})
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {/* The feed picker shows the list and its count; the heading is for
          screen readers. */}
      <h1 className="sr-only">
        {listTitle(feedId, counts)} {countFor(feedId, counts)} unread
      </h1>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {listShow !== undefined && (
          <ToggleGroup
            aria-label="Show"
            variant="outline"
            size="sm"
            spacing={0}
            value={[listShow.show]}
            onValueChange={(value) => {
              const [next] = value

              // Pressing the one already on would leave neither: ignore it.
              if (next === 'unread' || next === 'all') listShow.onChange(next)
            }}
          >
            {/* At least the same width each, so the two halves look even. */}
            <ToggleGroupItem value="unread" className="min-w-16">
              Unread
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="min-w-16">
              All
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        {newArticlesReady && (
          <Button
            variant="link"
            size="sm"
            onClick={onShowNewArticles}
            disabled={refreshing}
            className="ml-auto px-0"
          >
            New articles ready
          </Button>
        )}
        {!newArticlesReady && (
          <span className="ml-auto">
            Updated <RelativeTime at={snapshotAt} now={now} />
          </span>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Refresh"
          title="Refresh (r)"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {/* Spins while a refresh (or a reload) is under way. */}
          <RefreshCwIcon
            aria-hidden
            className={cn(refreshing && 'animate-spin')}
          />
        </Button>
      </div>
      {truncated && (
        <p className="text-muted-foreground text-sm">
          Showing the first {shown.toLocaleString('en-US')}. Refresh after
          clearing these to load more.
        </p>
      )}
    </div>
  )
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
