import { queryOptions } from '@tanstack/react-query'

import { checkForNewArticles, getArticleToRead } from '#/server/articles'
import { getBackdrop } from '#/server/backdrop'

/**
 * One article with its HTML, for reading (null if it no longer exists).
 * Its text doesn't change once stored, so a cached copy is shown at once:
 * going back to an article, or to one fetched ahead for `j` / `k`.
 */
export const articleQuery = (id: number) =>
  queryOptions({
    queryKey: ['article', id],
    queryFn: () => getArticleToRead({ data: { id } }),
    staleTime: Infinity,
  })

/**
 * The empty article pane's photo: a new pick each time the pane empties.
 * Dropped as soon as no pane shows it (an article opened), but a refresh
 * remounts the pane in the same render, so it keeps the photo it had.
 */
export const backdropQuery = () =>
  queryOptions({
    queryKey: ['backdrop'],
    queryFn: () => getBackdrop(),
    staleTime: Infinity,
    gcTime: 0,
  })

/** How often an open list asks whether newer articles are stored. */
const NEW_ARTICLES_POLL_MS = 30_000

/**
 * Whether a list's snapshot has fallen behind what is stored. Asked every
 * so often while the tab is visible, and when it comes back into view, until
 * the answer is yes; the list itself stays put until the reader reloads it.
 */
export const newArticlesQuery = (feedId: number | null, snapshotAt: number) =>
  queryOptions({
    queryKey: ['new-articles', feedId, snapshotAt],
    queryFn: () => checkForNewArticles({ data: { feedId, snapshotAt } }),
    refetchInterval: (query) =>
      query.state.data?.ready === true ? false : NEW_ARTICLES_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => query.state.data?.ready !== true,
    staleTime: 0,
    gcTime: 0,
  })
