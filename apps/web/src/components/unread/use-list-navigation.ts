import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { ArticleRow } from '@dusty/db'

import type { ArticleListHandle } from '#/components/unread/article-list'
import { articleQuery } from '#/lib/queries'

/**
 * Moving through one list: the cursor (by key or click), opening an
 * article (which reads it, and fetches its neighbours ahead), and what
 * screen readers hear. The list itself scrolls through `listRef`.
 */
export function useListNavigation(nav: {
  rows: readonly ArticleRow[]
  cursor: number
  /** The open article, if any. */
  openId: number | null
  onCursor: (id: number) => void
  onOpenArticle: (id: number) => void
  markOpenedRead: (id: number) => void
}) {
  const { rows } = nav
  const queryClient = useQueryClient()
  const listRef = useRef<ArticleListHandle>(null)

  // Said by screen readers when the cursor moves by key: what they hear is
  // shown nowhere else, so it is kept here.
  const [announcement, setAnnouncement] = useState('')

  const reveal = (index: number) => listRef.current?.reveal(index)

  // After a refresh (or opening a link to an article), bring the cursor's
  // row into view once: the list only exists once it has rendered.
  useEffect(() => {
    if (nav.cursor > 0) reveal(nav.cursor)
    // Only when the snapshot first shows.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Move the cursor, scrolling just enough to keep its row in view. */
  const moveTo = (index: number) => {
    const row = rows[index]

    if (row === undefined) return

    nav.onCursor(row.id)
    reveal(index)
    setAnnouncement(
      `${index + 1} of ${rows.length}: ${row.title ?? 'Untitled'}`
    )
  }

  /** Open a row's article: it is read, and its neighbours fetched ahead. */
  const open = (index: number) => {
    const row = rows[index]

    if (row === undefined) return

    nav.onCursor(row.id)
    reveal(index)

    // Already open (`j` on the last row, `k` on the first, Enter): nothing
    // more to do. Navigating to the page already shown would make the router
    // reload the list, and a list read to its end would come back empty.
    if (row.id === nav.openId) return

    nav.onOpenArticle(row.id)
    nav.markOpenedRead(row.id)

    // The articles either side, fetched ahead of `j` / `k` (or Next /
    // Previous on a phone), so moving to them shows them at once.
    for (const near of [rows[index - 1], rows[index + 1]]) {
      if (near !== undefined) {
        void queryClient.prefetchQuery(articleQuery(near.id))
      }
    }
  }

  return { listRef, announcement, moveTo, open }
}
