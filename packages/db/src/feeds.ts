import { asc, sql } from 'drizzle-orm'

import type { Db } from './client.ts'
import { feeds } from './schema.ts'

/** How a fetch went wrong, for health, logs and metrics. */
export type FetchErrorType =
  | 'timeout'
  | 'network'
  | 'http'
  | 'too_large'
  | 'invalid_feed'
  | 'internal'

/** One feed item, cleaned and ready to store. */
export interface StoredItem {
  readonly itemKey: string
  readonly url: string | null
  readonly title: string | null
  readonly author: string | null
  readonly contentHtml: string | null
  readonly excerpt: string | null
  /** From the feed; null when it has none (or a bad one). */
  readonly publishedAt: number | null
  readonly contentHash: string
}

export interface FeedToSync {
  readonly id: number
  readonly url: string
  readonly etag: string | null
  readonly lastModified: string | null
}

/**
 * Every feed, least recently fetched first (never-fetched feeds lead), so a
 * run cut short by its time budget is continued by the next run.
 */
export const listFeedsToSync = (db: Db): Promise<FeedToSync[]> =>
  db
    .select({
      id: feeds.id,
      url: feeds.url,
      etag: feeds.etag,
      lastModified: feeds.lastModified,
    })
    .from(feeds)
    .orderBy(sql`${feeds.lastFetchedAt} is not null`, asc(feeds.lastFetchedAt))

export interface FeedChanged {
  readonly items: readonly StoredItem[]
  readonly title: string | null
  readonly siteUrl: string | null
  readonly etag: string | null
  readonly lastModified: string | null
  readonly httpStatus: number
  readonly now: number
}

/**
 * Store a feed that returned new content (a 200), in one atomic batch:
 *
 * - Upsert its items. New ones are inserted unread; existing ones get their
 *   content updated only if it changed. `read_at`, `read_action_id`,
 *   `first_seen_at` and `published_at` are never touched after insert.
 *   Keys in `pruned_items` are skipped, so pruned articles stay gone.
 * - Mark pruned keys still in the feed as seen now.
 * - Record a successful fetch on the feed.
 *
 * Returns how many items were new.
 */
export const recordFeedChanged = async (
  db: Db,
  feedId: number,
  change: FeedChanged
): Promise<{ readonly newItems: number }> => {
  const { items, now } = change
  const itemsJson = JSON.stringify(items)
  const keysJson = JSON.stringify(items.map((item) => item.itemKey))
  const newestDated = newestDate(items)

  const [inserted] = await db.batch([
    db.all<{ itemKey: string; firstSeenAt: number }>(sql`
      insert into articles (
        feed_id, item_key, url, title, author, content_html, excerpt,
        published_at, first_seen_at, updated_at, content_hash
      )
      select
        ${feedId},
        json_extract(item.value, '$.itemKey'),
        json_extract(item.value, '$.url'),
        json_extract(item.value, '$.title'),
        json_extract(item.value, '$.author'),
        json_extract(item.value, '$.contentHtml'),
        json_extract(item.value, '$.excerpt'),
        coalesce(json_extract(item.value, '$.publishedAt'), ${now}),
        ${now},
        ${now},
        json_extract(item.value, '$.contentHash')
      from json_each(${itemsJson}) as item
      where not exists (
        select 1 from pruned_items
        where pruned_items.feed_id = ${feedId}
          and pruned_items.item_key = json_extract(item.value, '$.itemKey')
      )
      on conflict (feed_id, item_key) do update set
        url = excluded.url,
        title = excluded.title,
        author = excluded.author,
        content_html = excluded.content_html,
        excerpt = excluded.excerpt,
        updated_at = excluded.updated_at,
        content_hash = excluded.content_hash
      where articles.content_hash != excluded.content_hash
      returning item_key as itemKey, first_seen_at as firstSeenAt
    `),
    db.run(sql`
      update pruned_items set last_seen_at = ${now}
      where feed_id = ${feedId}
        and item_key in (select value from json_each(${keysJson}))
    `),
    db.run(sql`
      update feeds set
        title = coalesce(${change.title}, title),
        site_url = coalesce(${change.siteUrl}, site_url),
        etag = ${change.etag},
        last_modified = ${change.lastModified},
        last_fetched_at = ${now},
        last_outcome = 'ok',
        last_http_status = ${change.httpStatus},
        last_success_at = ${now},
        last_changed_at = ${now},
        last_published_at = (
          select max(published) from (
            select last_published_at as published
            union all select ${newestDated}
            union all
              select max(published_at) from articles
              where feed_id = ${feedId} and first_seen_at = ${now}
          )
        ),
        first_failure_at = null,
        consecutive_failures = 0,
        last_error = null
      where id = ${feedId}
    `),
  ])

  const newItems = inserted.filter((row) => row.firstSeenAt === now).length

  return { newItems }
}

/**
 * The newest date the feed gives its items. `last_published_at` also counts
 * items first stored by this fetch, whose undated ones are dated now, so a
 * feed without item dates still shows as active while it keeps posting.
 */
const newestDate = (items: readonly StoredItem[]): number | null => {
  const dates = items.flatMap((item) => {
    if (item.publishedAt === null) return []

    return [item.publishedAt]
  })

  if (dates.length === 0) return null

  return Math.max(...dates)
}

/**
 * Record a 304: the feed is unchanged since the last 200, so every pruned
 * key seen in that response is still in the feed.
 */
export const recordFeedNotModified = async (
  db: Db,
  feedId: number,
  now: number
): Promise<void> => {
  await db.batch([
    db.run(sql`
      update pruned_items set last_seen_at = ${now}
      where feed_id = ${feedId}
        and last_seen_at >= (select last_changed_at from feeds where id = ${feedId})
    `),
    db.run(sql`
      update feeds set
        last_fetched_at = ${now},
        last_outcome = 'not_modified',
        last_http_status = 304,
        last_success_at = ${now},
        first_failure_at = null,
        consecutive_failures = 0,
        last_error = null
      where id = ${feedId}
    `),
  ])
}

export interface FeedFailure {
  readonly errorType: FetchErrorType
  /** Plain words for the health view, e.g. "404 not found". */
  readonly message: string
  readonly httpStatus: number | null
  readonly now: number
}

/** Record a failed fetch. The first failure time is kept until a success. */
export const recordFeedFailure = async (
  db: Db,
  feedId: number,
  failure: FeedFailure
): Promise<void> => {
  await db.run(sql`
    update feeds set
      last_fetched_at = ${failure.now},
      last_outcome = ${failure.errorType},
      last_http_status = ${failure.httpStatus},
      first_failure_at = coalesce(first_failure_at, ${failure.now}),
      consecutive_failures = consecutive_failures + 1,
      last_error = ${failure.message}
    where id = ${feedId}
  `)
}
