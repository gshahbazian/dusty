import { cn } from 'cn'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import type { ArticleRow, FeedCount, ListShow } from '@dusty/db'

import { openInNewTab } from '#/lib/open-in-new-tab'
import { syncForRefresh } from '#/server/functions'
import { useCommands } from '#/components/keyboard/keyboard-shortcuts'
import { ArticleList } from '#/components/unread/article-list'
import { ArticleView } from '#/components/unread/article-view'
import {
  cursorIndex,
  feedFromPath,
  neighborFeed,
} from '#/components/unread/cursor'
import { ListHeader } from '#/components/unread/list-header'
import { adjustedCounts } from '#/components/unread/list-state'
import { EmptyPane } from '#/components/unread/empty-pane'
import { MobileArticleBar } from '#/components/unread/mobile-article-bar'
import { NoticeBar } from '#/components/unread/notice-bar'
import {
  articleNeighbors,
  commandsFor,
} from '#/components/unread/unread-commands'
import { useListNavigation } from '#/components/unread/use-list-navigation'
import { useUnreadList } from '#/components/unread/use-unread-list'

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
  // The cursor lives above the snapshot, so a refresh keeps it on the same
  // article. Another list (feed, or unread / all) is a new page (the route
  // keys it), so it starts on its first row.
  const [cursorId, setCursorId] = useState<number | null>(articleId)

  const listKey = `${feedId ?? 'all'}-${listShow?.show ?? 'unread'}`

  return (
    <UnreadSnapshot
      key={data.snapshotAt}
      data={data}
      feedId={feedId}
      listShow={listShow}
      listKey={listKey}
      articleId={articleId}
      cursorId={cursorId}
      onCursor={setCursorId}
      onOpenArticle={onOpenArticle}
    />
  )
}

function UnreadSnapshot({
  data,
  feedId,
  listShow,
  listKey,
  articleId,
  cursorId,
  onCursor,
  onOpenArticle,
}: {
  data: UnreadListData
  feedId: number | null
  listShow: ListShowControl | undefined
  listKey: string
  articleId: number | null
  cursorId: number | null
  onCursor: (id: number) => void
  onOpenArticle: (id: number | null) => void
}) {
  const { rows } = data
  const list = useUnreadList(rows, data.snapshotAt, articleId)
  const openRead = articleId !== null && list.isRead(articleId)

  const counts = adjustedCounts(data.counts, rows, list.overrides)
  const [now] = useState(() => Date.now())
  const { refreshing, refresh } = useRefresh(list.fail)
  const navigate = useNavigate()
  const router = useRouter()
  const articleScroll = useRef<HTMLElement>(null)

  // Every feed, caught up or not: a feed's page can show its read
  // articles too.
  const feeds = counts.byFeed

  const cursor = cursorIndex(rows, cursorId)
  const articleOpen = articleId !== null

  const { listRef, announcement, moveTo, open } = useListNavigation({
    rows,
    cursor,
    onCursor,
    onOpenArticle,
    markOpenedRead: list.markOpenedRead,
  })

  const neighbors = articleNeighbors(rows, cursor, articleId, open)

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
      refresh: () => refresh(),
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
      openUrl: openInNewTab,
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
          onRefresh={() => refresh()}
          onPickFeed={goToFeed}
        />

        {/* An empty list is just empty: the picker's count says (0), and the
            screen-reader heading says "0 unread". */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <ArticleList
          ref={listRef}
          listKey={listKey}
          rows={rows}
          cursor={cursor}
          openId={articleId}
          now={now}
          showFeed={feedId === null}
          actions={{
            busy: list.busy,
            isRead: list.isRead,
            open,
            markRead: list.markOneRead,
            markUnread: list.markOneUnread,
            markAllAbove: list.markAllAbove,
          }}
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
        {articleId !== null && <ArticleView articleId={articleId} />}
        {articleId !== null && (
          <MobileArticleBar
            read={openRead}
            onBack={() => onOpenArticle(null)}
            onPrevious={neighbors.previous}
            onNext={neighbors.next}
            onMarkUnread={() => list.markOneUnread(articleId)}
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
 * Run the sync, wait for it, then reload the list and counts, so what it
 * fetched shows at once. A sync that ran a few minutes ago is skipped and
 * returns at once; a running one takes at most its on-demand budget. If the
 * sync can't be reached, say so and leave the list as it is.
 */
function useRefresh(onFailed: (text: string) => void) {
  const router = useRouter()

  const refresh = useMutation({
    mutationFn: async () => {
      await syncForRefresh()
      await router.invalidate()
    },
    onError: () =>
      onFailed("Couldn't check the feeds. The list is unchanged; try again."),
  })

  return {
    refreshing: refresh.isPending,
    refresh: () => {
      if (!refresh.isPending) refresh.mutate()
    },
  }
}
