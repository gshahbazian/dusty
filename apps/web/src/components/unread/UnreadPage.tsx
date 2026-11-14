import { cn } from 'cn'
import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import type { ArticleRow, FeedCount } from '@dusty/db'

import { requestSync } from '../../server/functions.ts'
import { RelativeTime } from '../RelativeTime.tsx'
import { ArticleListItem } from './ArticleListItem.tsx'
import { ArticleView } from './ArticleView.tsx'
import { adjustedCounts, type Counts } from './list-state.ts'
import { useUnreadList, type Notice } from './useUnreadList.ts'

export interface UnreadListData {
  readonly rows: readonly ArticleRow[]
  readonly counts: readonly FeedCount[]
  readonly snapshotAt: number
}

/**
 * An unread list (all feeds, or one) with the article being read beside it.
 * Keyed by the snapshot, so a refresh starts from the new list's state.
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
  return (
    <UnreadSnapshot
      key={data.snapshotAt}
      data={data}
      feedId={feedId}
      articleId={articleId}
      onOpenArticle={onOpenArticle}
    />
  )
}

function listTitle(feedId: number | null, counts: Counts): string {
  if (feedId === null) return 'All unread'

  const feed = counts.byFeed.find((count) => count.feedId === feedId)

  return feed?.title ?? 'Feed not found'
}

function UnreadSnapshot({
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
  const list = useUnreadList(data.rows, data.snapshotAt)
  const counts = adjustedCounts(data.counts, data.rows, list.overrides)
  const shownCount = countFor(feedId, counts)
  const [now] = useState(() => Date.now())

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <FeedNav counts={counts} feedId={feedId} />

      {/*
        The list keeps one width whether or not an article is open, so
        opening one never re-wraps rows or moves them under the cursor.
      */}
      <section className="flex flex-col gap-3 lg:w-[32rem] lg:shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">
            {listTitle(feedId, counts)}{' '}
            <span className="text-base font-normal text-neutral-500">
              {shownCount} unread
            </span>
          </h1>
          <RefreshButton snapshotAt={data.snapshotAt} now={now} />
        </div>

        <NoticeBar
          notice={list.notice}
          busy={list.busy}
          onUndo={list.undo}
          onDismiss={list.dismissNotice}
        />

        {data.rows.length === 0 && (
          <p className="text-neutral-500">
            Nothing unread. Refresh to check for new articles.
          </p>
        )}

        <ul aria-label="Unread articles">
          {data.rows.map((row, index) => (
            <ArticleListItem
              key={row.id}
              row={row}
              read={list.isRead(row.id)}
              first={index === 0}
              open={articleId === row.id}
              now={now}
              showFeed={feedId === null}
              busy={list.busy}
              onOpen={() => onOpenArticle(row.id)}
              onMarkRead={() => void list.markOneRead(row.id)}
              onMarkUnread={() => void list.markOneUnread(row.id)}
              onMarkAllAbove={() => void list.markAllAbove(row.id)}
            />
          ))}
        </ul>
      </section>

      {/*
        On a wide screen the reading pane is always there, so the layout is
        the same before and after opening an article. Narrower, the article
        covers the list instead.
      */}
      <div className="xl:min-w-0 xl:flex-1">
        {articleId !== null && (
          <ArticleView
            articleId={articleId}
            read={list.isRead(articleId)}
            onOpened={(id) => void list.markOpenedRead(id)}
            onMarkUnread={(id) => void list.markOneUnread(id)}
            onClose={() => onOpenArticle(null)}
          />
        )}
        {articleId === null && data.rows.length > 0 && (
          <p className="sticky top-4 hidden rounded-lg border border-dashed border-neutral-300 p-8 text-center text-neutral-500 xl:block dark:border-neutral-700">
            Choose an article to read it here.
          </p>
        )}
      </div>
    </div>
  )
}

const countFor = (feedId: number | null, counts: Counts): number => {
  if (feedId === null) return counts.total

  return counts.byFeed.find((count) => count.feedId === feedId)?.unread ?? 0
}

/** All unread, then each feed with unread articles, with counts. */
function FeedNav({
  counts,
  feedId,
}: {
  counts: Counts
  feedId: number | null
}) {
  const withUnread = counts.byFeed.filter(
    (count) => count.unread > 0 || count.feedId === feedId
  )

  return (
    <nav aria-label="Feeds" className="lg:w-56 lg:shrink-0">
      <details className="lg:hidden">
        <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">
          Feeds ({withUnread.length} with unread)
        </summary>
        <FeedLinks counts={counts} feeds={withUnread} />
      </details>
      <div className="hidden lg:block">
        <FeedLinks counts={counts} feeds={withUnread} />
      </div>
    </nav>
  )
}

function FeedLinks({
  counts,
  feeds,
}: {
  counts: Counts
  feeds: readonly FeedCount[]
}) {
  return (
    <ul className="mt-2 flex flex-col gap-0.5 lg:mt-0">
      <li>
        <Link
          to="/"
          className="flex justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          activeProps={{
            className: 'bg-neutral-100 font-medium dark:bg-neutral-800',
          }}
          activeOptions={{ exact: true, includeSearch: false }}
        >
          <span>All unread</span>
          <span className="text-neutral-500">{counts.total}</span>
        </Link>
      </li>
      {feeds.map((feed) => (
        <li key={feed.feedId}>
          <Link
            to="/feeds/$feedId"
            params={{ feedId: String(feed.feedId) }}
            className="flex justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            activeProps={{
              className: 'bg-neutral-100 font-medium dark:bg-neutral-800',
            }}
            activeOptions={{ includeSearch: false }}
          >
            <span className="break-words">{feed.title}</span>
            <span className="text-neutral-500">{feed.unread}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Reload the list and counts, and ask the sync service to run (skipped if
 * one ran in the last few minutes). Shows when the data was last loaded.
 */
function RefreshButton({
  snapshotAt,
  now,
}: {
  snapshotAt: number
  now: number
}) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)

    try {
      await requestSync({ data: 'refresh' })
      await router.invalidate()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500">
      {!refreshing && (
        <span>
          Updated <RelativeTime at={snapshotAt} now={now} label="Updated" />
        </span>
      )}
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={refreshing}
        className="rounded-md border border-neutral-300 px-3 py-1 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}

function NoticeBar({
  notice,
  busy,
  onUndo,
  onDismiss,
}: {
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
        'flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm',
        notice.kind === 'error' &&
          'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
        notice.kind !== 'error' &&
          'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
      )}
    >
      <span className="flex-1">{notice.text}</span>
      {notice.kind === 'marked' && (
        <button
          type="button"
          onClick={() => onUndo(notice.actionId)}
          disabled={busy}
          className="font-medium underline disabled:opacity-50"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-neutral-500"
      >
        ×
      </button>
    </output>
  )
}
