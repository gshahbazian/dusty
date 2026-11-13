import { eq, sql } from 'drizzle-orm'

import type { Db } from './client.ts'
import { feedHealthSql, type FeedHealth, type HealthOptions } from './health.ts'
import { feeds } from './schema.ts'

export interface FeedRef {
  readonly id: number
  /** What the owner sees: their rename, else the feed's title, else its URL. */
  readonly title: string
  readonly url: string
}

const displayTitle = sql<string>`coalesce(${feeds.customTitle}, ${feeds.title}, ${feeds.url})`

/** The subscription with exactly this URL, if any. */
export const findFeedByUrl = async (
  db: Db,
  url: string
): Promise<FeedRef | null> => {
  const [row] = await db
    .select({ id: feeds.id, title: displayTitle, url: feeds.url })
    .from(feeds)
    .where(eq(feeds.url, url))

  return row ?? null
}

/**
 * Subscribe to a URL. Returns the new feed's id, or null if it is already
 * subscribed (the URL is unique, so two adds racing cannot both win).
 */
export const insertFeed = async (
  db: Db,
  feed: {
    readonly url: string
    readonly customTitle: string | null
    readonly now: number
  }
): Promise<number | null> => {
  const [row] = await db
    .insert(feeds)
    .values({
      url: feed.url,
      customTitle: feed.customTitle,
      createdAt: feed.now,
    })
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id })

  return row?.id ?? null
}

/** Set the display title. An empty or missing title goes back to the feed's own. */
export const renameFeed = async (
  db: Db,
  feedId: number,
  title: string | null
): Promise<{ readonly renamed: boolean }> => {
  const trimmed = title?.trim() ?? ''

  const rows = await db
    .update(feeds)
    .set({ customTitle: trimmed === '' ? null : trimmed })
    .where(eq(feeds.id, feedId))
    .returning({ id: feeds.id })

  return { renamed: rows.length > 0 }
}

/**
 * Unsubscribe. The feed's articles, their content and its pruned keys are
 * deleted with it (foreign keys cascade), so they leave every list and
 * count at once.
 */
export const removeFeed = async (
  db: Db,
  feedId: number
): Promise<{ readonly removed: boolean }> => {
  const rows = await db
    .delete(feeds)
    .where(eq(feeds.id, feedId))
    .returning({ id: feeds.id })

  return { removed: rows.length > 0 }
}

/** One row of the subscriptions view. */
export interface Subscription {
  readonly id: number
  readonly url: string
  readonly title: string
  /** The feed's own title, to show next to a rename. */
  readonly feedTitle: string | null
  readonly customTitle: string | null
  readonly siteUrl: string | null
  readonly unread: number
  readonly health: FeedHealth
  readonly createdAt: number
  readonly lastPublishedAt: number | null
  readonly lastSuccessAt: number | null
  readonly lastFetchedAt: number | null
  readonly firstFailureAt: number | null
  readonly consecutiveFailures: number
  readonly lastError: string | null
}

/**
 * Every subscription with its unread count and health, in one query. Health
 * uses `feedHealthSql`, the same definition the sync metrics count.
 */
export const listSubscriptions = (
  db: Db,
  health: HealthOptions
): Promise<Subscription[]> =>
  db.all<Subscription>(sql`
    select
      feeds.id as id,
      feeds.url as url,
      coalesce(feeds.custom_title, feeds.title, feeds.url) as title,
      feeds.title as feedTitle,
      feeds.custom_title as customTitle,
      feeds.site_url as siteUrl,
      (
        select count(*) from articles
        where articles.feed_id = feeds.id and articles.read_at is null
      ) as unread,
      ${feedHealthSql(health)} as health,
      feeds.created_at as createdAt,
      feeds.last_published_at as lastPublishedAt,
      feeds.last_success_at as lastSuccessAt,
      feeds.last_fetched_at as lastFetchedAt,
      feeds.first_failure_at as firstFailureAt,
      feeds.consecutive_failures as consecutiveFailures,
      feeds.last_error as lastError
    from feeds
    order by lower(coalesce(feeds.custom_title, feeds.title, feeds.url)), feeds.id
  `)
