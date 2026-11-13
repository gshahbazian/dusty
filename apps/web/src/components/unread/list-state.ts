import type { ArticleRow, FeedCount } from '@dusty/db'

/**
 * Read state the page has learned since the list was loaded, by article id
 * (true = read). Every row starts unread: the list only holds unread rows.
 * Only server-confirmed changes go in here.
 */
export type ReadOverrides = ReadonlyMap<number, boolean>

export const isRead = (overrides: ReadOverrides, id: number): boolean =>
  overrides.get(id) === true

/** The overrides with these articles set to read (or unread). */
export const withRead = (
  overrides: ReadOverrides,
  ids: readonly number[],
  read: boolean
): ReadOverrides => {
  const next = new Map(overrides)

  for (const id of ids) next.set(id, read)

  return next
}

/**
 * Exactly the rows above the chosen one, in on-screen order. Rows already
 * read are included: the server leaves them as they are, so the action
 * covers precisely what the owner sees above the row.
 */
export const idsAbove = (
  rows: readonly ArticleRow[],
  chosenId: number
): number[] => {
  const index = rows.findIndex((row) => row.id === chosenId)

  if (index <= 0) return []

  return rows.slice(0, index).map((row) => row.id)
}

export interface Counts {
  readonly total: number
  readonly byFeed: readonly FeedCount[]
}

/**
 * The loaded counts, less the rows marked read since: counts and rows agree
 * without reloading the list (which would move rows).
 */
export const adjustedCounts = (
  counts: readonly FeedCount[],
  rows: readonly ArticleRow[],
  overrides: ReadOverrides
): Counts => {
  const readByFeed = new Map<number, number>()

  for (const row of rows) {
    if (!isRead(overrides, row.id)) continue

    readByFeed.set(row.feedId, (readByFeed.get(row.feedId) ?? 0) + 1)
  }

  const byFeed = counts.map((count) => ({
    ...count,
    unread: Math.max(0, count.unread - (readByFeed.get(count.feedId) ?? 0)),
  }))

  return {
    total: byFeed.reduce((sum, count) => sum + count.unread, 0),
    byFeed,
  }
}

/** "1 article" / "3 articles". */
export const articles = (count: number): string =>
  count === 1 ? '1 article' : `${count} articles`
