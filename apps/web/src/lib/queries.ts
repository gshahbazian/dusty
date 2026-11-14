import { queryOptions } from '@tanstack/react-query'

import { getArticleToRead } from '#/server/articles'
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

/** The empty article pane's photo: a new pick each time the pane empties. */
export const backdropQuery = () =>
  queryOptions({
    queryKey: ['backdrop'],
    queryFn: () => getBackdrop(),
    staleTime: 0,
    gcTime: 0,
  })
