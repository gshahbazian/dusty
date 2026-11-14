import type { ArticleRow, FeedCount } from '@dusty/db'

/**
 * Read state the page has learned since the list was loaded, by article id
 * (true = read). Only server-confirmed changes go in here.
 */
export type ReadOverrides = ReadonlyMap<number, boolean>

/** The ids of the rows that were already read when the list loaded. */
export const readWhenLoaded = (
  rows: readonly ArticleRow[]
): ReadonlySet<number> =>
  new Set(rows.flatMap((row) => (row.readAt === null ? [] : [row.id])))

/**
 * Whether an article is read now: what the page has learned since loading,
 * else how the list loaded it (an unread list loads every row unread; a
 * feed's "all" list loads some read).
 */
export const isRead = (
  overrides: ReadOverrides,
  id: number,
  loadedRead: ReadonlySet<number> = new Set()
): boolean => overrides.get(id) ?? loadedRead.has(id)

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
 * The loaded unread counts, moved by every row whose read state changed
 * since: down for each marked read, up for each (loaded read) marked
 * unread. Counts and rows agree without reloading the list (which would
 * move rows).
 */
export const adjustedCounts = (
  counts: readonly FeedCount[],
  rows: readonly ArticleRow[],
  overrides: ReadOverrides
): Counts => {
  const change = new Map<number, number>()

  for (const row of rows) {
    const before = row.readAt !== null
    const now = overrides.get(row.id) ?? before

    if (now === before) continue

    change.set(row.feedId, (change.get(row.feedId) ?? 0) + (now ? -1 : 1))
  }

  const byFeed = counts.map((count) => ({
    ...count,
    unread: Math.max(0, count.unread + (change.get(count.feedId) ?? 0)),
  }))

  return {
    total: byFeed.reduce((sum, count) => sum + count.unread, 0),
    byFeed,
  }
}

/** "1 article" / "3 articles". */
export const articles = (count: number): string =>
  count === 1 ? '1 article' : `${count} articles`
