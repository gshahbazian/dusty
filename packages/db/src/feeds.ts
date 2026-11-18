import { asc, sql, type SQL } from 'drizzle-orm'

import type { Db } from '#/client'
import { feeds } from '#/schema'

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
  /** Characters of the content's plain text, whitespace collapsed (0 for none). */
  readonly textLength: number
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
  /**
   * Store new articles as already read. Used by OPML import, so importing a
   * feed does not flood the unread list with its back catalogue.
   */
  readonly newArticlesRead?: boolean
  /**
   * In a feed with `show_updates` on, an edit that grows an article's text
   * by at least this many characters is an update: the article comes back
   * as unread (`UPDATE_MIN_GROWTH_CHARS`).
   */
  readonly updateMinGrowthChars: number
}

export interface FeedChangedResult {
  /** Items stored for the first time. */
  readonly newItems: number
  /** Items already stored whose content hash changed. */
  readonly editedItems: number
  /** Edits that were updates: those articles are unread again. */
  readonly updatedItems: number
}

/**
 * D1 limits a single string (and so a bound parameter) to about 2 MB. Items
 * go to SQL as JSON through `json_each`, split into chunks well under that.
 */
const MAX_CHUNK_BYTES = 1_000_000

const encoder = new TextEncoder()

/**
 * Split values into JSON arrays that each stay under `MAX_CHUNK_BYTES`.
 * Always at least one (possibly `[]`), so a batch always has a statement.
 */
const jsonChunks = <T>(values: readonly T[]): [string, ...string[]] => {
  const chunks: string[] = []
  let current: string[] = []
  let size = 2

  for (const value of values) {
    const json = JSON.stringify(value)
    const bytes = encoder.encode(json).byteLength + 1

    if (current.length > 0 && size + bytes > MAX_CHUNK_BYTES) {
      chunks.push(`[${current.join(',')}]`)
      current = []
      size = 2
    }

    current.push(json)
    size += bytes
  }

  // Chunk order does not matter: each one is written independently.
  return [`[${current.join(',')}]`, ...chunks]
}

/**
 * Store a feed that returned new content (a 200), in one atomic batch:
 *
 * - Upsert its items' metadata. New ones are inserted unread; existing ones
 *   are updated only if they changed. `first_seen_at` and `published_at`
 *   are never touched after insert. `read_at` and `read_action_id` are
 *   cleared only by an update (an edit that grows the text by at least
 *   `updateMinGrowthChars`, in a feed with `show_updates` on), which also
 *   moves `surfaced_at` to now. Keys in `pruned_items` are skipped, so
 *   pruned articles stay gone, unless the same rule finds an update
 *   against the pruned key's stored length: then the article is stored
 *   again, unread, with its old `first_seen_at`, and its key is no longer
 *   pruned.
 * - Write the HTML of every article inserted or changed now into
 *   `article_content`, and remove it for changed items that lost theirs.
 * - Mark pruned keys still in the feed as seen now, with their current
 *   text length.
 * - Record a successful fetch on the feed.
 *
 * Returns how many items were new, how many existing ones were edited (their
 * hash changed) and how many of those edits were updates.
 */
export const recordFeedChanged = async (
  db: Db,
  feedId: number,
  change: FeedChanged
): Promise<FeedChangedResult> => {
  const { items, now } = change
  const newestDated = newestDate(items)

  const metadata = items.map((item) => ({
    itemKey: item.itemKey,
    url: item.url,
    title: item.title,
    author: item.author,
    excerpt: item.excerpt,
    publishedAt: item.publishedAt,
    contentHash: item.contentHash,
    textLength: item.textLength,
  }))

  const contents = items.flatMap((item) => {
    if (item.contentHtml === null) return []

    return [{ itemKey: item.itemKey, html: item.contentHtml }]
  })

  const withoutContent = items.flatMap((item) => {
    if (item.contentHtml !== null) return []

    return [item.itemKey]
  })

  // An update: the feed shows updates and the text grew enough since it
  // was last stored. A null stored length (not yet known) makes this null,
  // so it is never an update.
  const isUpdate = (newLength: SQL, storedLength: SQL) => sql`(
    (select show_updates from feeds where id = ${feedId}) = 1
    and ${newLength} - ${storedLength} >= ${change.updateMinGrowthChars}
  )`

  const storedUpdated = isUpdate(
    sql`excluded.text_length`,
    sql`articles.text_length`
  )

  const prunedUpdated = isUpdate(
    sql`json_extract(item.value, '$.textLength')`,
    sql`pruned.text_length`
  )

  const upsert = (chunk: string) =>
    db.all<{ firstSeenAt: number; surfacedAt: number }>(sql`
      insert into articles (
        feed_id, item_key, url, title, author, excerpt,
        published_at, first_seen_at, surfaced_at, updated_at, content_hash,
        text_length, read_at
      )
      select
        ${feedId},
        json_extract(item.value, '$.itemKey'),
        json_extract(item.value, '$.url'),
        json_extract(item.value, '$.title'),
        json_extract(item.value, '$.author'),
        json_extract(item.value, '$.excerpt'),
        coalesce(json_extract(item.value, '$.publishedAt'), ${now}),
        -- A pruned article coming back keeps when it was first seen (the
        -- prune time for keys pruned before that was kept).
        coalesce(pruned.first_seen_at, pruned.pruned_at, ${now}),
        ${now},
        ${now},
        json_extract(item.value, '$.contentHash'),
        json_extract(item.value, '$.textLength'),
        ${change.newArticlesRead === true ? now : null}
      from json_each(${chunk}) as item
      left join pruned_items as pruned
        on pruned.feed_id = ${feedId}
        and pruned.item_key = json_extract(item.value, '$.itemKey')
      where pruned.item_key is null or ${prunedUpdated}
      on conflict (feed_id, item_key) do update set
        url = excluded.url,
        title = excluded.title,
        author = excluded.author,
        excerpt = excluded.excerpt,
        updated_at = excluded.updated_at,
        content_hash = excluded.content_hash,
        text_length = excluded.text_length,
        read_at = case when ${storedUpdated} then null else articles.read_at end,
        read_action_id = case when ${storedUpdated}
          then null else articles.read_action_id end,
        surfaced_at = case when ${storedUpdated}
          then excluded.surfaced_at else articles.surfaced_at end
      where articles.content_hash != excluded.content_hash
      returning first_seen_at as firstSeenAt, surfaced_at as surfacedAt
    `)

  const [firstChunk, ...moreChunks] = jsonChunks(metadata)
  const upserts = [upsert(firstChunk), ...moreChunks.map(upsert)] as const

  // Only articles inserted or changed by this fetch (`updated_at = now`)
  // get their HTML written; unchanged ones keep what they have.
  //
  // `cross join` makes SQLite loop over the items and look each article up
  // by (feed_id, item_key). With a plain join it looped over the feed's
  // articles and scanned every item for each one, so adding a feed took
  // quadratic time (6,000 items: 14 s, holding the database the whole time).
  const contentWrites = jsonChunks(contents).map((chunk) =>
    db.run(sql`
      insert into article_content (article_id, html)
      select articles.id, json_extract(item.value, '$.html')
      from json_each(${chunk}) as item
      cross join articles
        on articles.feed_id = ${feedId}
        and articles.item_key = json_extract(item.value, '$.itemKey')
      where articles.updated_at = ${now}
      on conflict (article_id) do update set html = excluded.html
    `)
  )

  const contentRemovals = jsonChunks(withoutContent).map((chunk) =>
    db.run(sql`
      delete from article_content
      where article_id in (
        select id from articles
        where feed_id = ${feedId}
          and updated_at = ${now}
          and item_key in (select value from json_each(${chunk}))
      )
    `)
  )

  // A pruned key that an update brought back is an article again.
  const revivedUnpruned = db.run(sql`
    delete from pruned_items
    where feed_id = ${feedId}
      and exists (
        select 1 from articles
        where articles.feed_id = ${feedId}
          and articles.item_key = pruned_items.item_key
      )
  `)

  // After the upserts, which compare against the stored length: from now
  // on, the next update is measured from this version.
  //
  // Written as an upsert that only ever updates (`exists` lets through
  // keys already pruned), so SQLite loops over the items and looks each
  // key up. As `update ... from json_each`, it scanned every item for each
  // of the feed's pruned keys.
  const seenPruned = jsonChunks(
    items.map((item) => ({
      itemKey: item.itemKey,
      textLength: item.textLength,
    }))
  ).map((chunk) =>
    db.run(sql`
      insert into pruned_items (
        feed_id, item_key, pruned_at, last_seen_at, text_length
      )
      select
        ${feedId},
        json_extract(item.value, '$.itemKey'),
        ${now},
        ${now},
        json_extract(item.value, '$.textLength')
      from json_each(${chunk}) as item
      where exists (
        select 1 from pruned_items as pruned
        where pruned.feed_id = ${feedId}
          and pruned.item_key = json_extract(item.value, '$.itemKey')
      )
      on conflict (feed_id, item_key) do update set
        last_seen_at = excluded.last_seen_at,
        text_length = excluded.text_length
    `)
  )

  const feedUpdate = db.run(sql`
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
  `)

  // The upserts run first and the feed update last: it counts the articles
  // this fetch inserted.
  const results = await db.batch([
    ...upserts,
    ...contentWrites,
    ...contentRemovals,
    revivedUnpruned,
    ...seenPruned,
    feedUpdate,
  ])

  const inserted = results
    .slice(0, upserts.length)
    .flatMap((rows) => (Array.isArray(rows) ? rows : []))

  const existing = inserted.filter((row) => row.firstSeenAt !== now)

  return {
    newItems: inserted.length - existing.length,
    editedItems: existing.length,
    updatedItems: existing.filter((row) => row.surfacedAt === now).length,
  }
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
