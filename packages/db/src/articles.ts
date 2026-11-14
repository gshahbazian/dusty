import { sql } from 'drizzle-orm'

import type { Db } from './client.ts'

/** One row of an unread list: metadata only, never the article's HTML. */
export interface ArticleRow {
  readonly id: number
  readonly feedId: number
  readonly feedTitle: string
  readonly title: string | null
  readonly url: string | null
  readonly excerpt: string | null
  readonly publishedAt: number
}

const FEED_TITLE = sql`coalesce(feeds.custom_title, feeds.title, feeds.url)`

/**
 * Unread articles, in list order. The global list (no `feedId`) is oldest
 * first; a feed's list is newest first. `id` breaks ties in the same
 * direction, so the order never shuffles between loads.
 *
 * Only articles first seen by `seenBy` (the list's snapshot time) are
 * listed: the same rule "mark all above" checks, so every row on screen is
 * one it will act on, even if a sync lands while the list is being read.
 */
export const listUnread = (
  db: Db,
  options: { readonly feedId: number | null; readonly seenBy: number }
): Promise<ArticleRow[]> => {
  if (options.feedId === null) {
    return db.all<ArticleRow>(sql`
      select articles.id as id, articles.feed_id as feedId,
        ${FEED_TITLE} as feedTitle, articles.title as title,
        articles.url as url, articles.excerpt as excerpt,
        articles.published_at as publishedAt
      from articles join feeds on feeds.id = articles.feed_id
      where articles.read_at is null
        and articles.first_seen_at <= ${options.seenBy}
      order by articles.published_at asc, articles.id asc
    `)
  }

  return db.all<ArticleRow>(sql`
    select articles.id as id, articles.feed_id as feedId,
      ${FEED_TITLE} as feedTitle, articles.title as title,
      articles.url as url, articles.excerpt as excerpt,
      articles.published_at as publishedAt
    from articles join feeds on feeds.id = articles.feed_id
    where articles.read_at is null and articles.feed_id = ${options.feedId}
      and articles.first_seen_at <= ${options.seenBy}
    order by articles.published_at desc, articles.id desc
  `)
}

export interface FeedCount {
  readonly feedId: number
  readonly title: string
  readonly unread: number
}

/**
 * Unread counts for every feed (zeros included), in one query, counting
 * the same articles the list shows: those first seen by `seenBy`.
 */
export const unreadCounts = (
  db: Db,
  options: { readonly seenBy: number }
): Promise<FeedCount[]> =>
  db.all<FeedCount>(sql`
    select feeds.id as feedId, ${FEED_TITLE} as title,
      count(articles.id) as unread
    from feeds
    left join articles
      on articles.feed_id = feeds.id and articles.read_at is null
        and articles.first_seen_at <= ${options.seenBy}
    group by feeds.id
    order by lower(${FEED_TITLE}), feeds.id
  `)

export interface Article extends ArticleRow {
  readonly author: string | null
  readonly html: string | null
  readonly readAt: number | null
  readonly siteUrl: string | null
}

/** One article with its HTML, for reading. Null if it no longer exists. */
export const getArticle = async (
  db: Db,
  articleId: number
): Promise<Article | null> => {
  const [article] = await db.all<Article>(sql`
    select articles.id as id, articles.feed_id as feedId,
      ${FEED_TITLE} as feedTitle, articles.title as title,
      articles.url as url, articles.excerpt as excerpt,
      articles.published_at as publishedAt, articles.author as author,
      article_content.html as html, articles.read_at as readAt,
      feeds.site_url as siteUrl
    from articles
    join feeds on feeds.id = articles.feed_id
    left join article_content on article_content.article_id = articles.id
    where articles.id = ${articleId}
  `)

  return article ?? null
}

export interface MarkRead {
  /** Exactly the articles to mark, e.g. the rows above the chosen one. */
  readonly ids: readonly number[]
  /**
   * The list's snapshot time: articles first seen after it are never
   * marked, even if listed. Null for actions not tied to a list (opening an
   * article).
   */
  readonly snapshotAt: number | null
  readonly actionId: string
  readonly now: number
}

/**
 * Mark articles read, in one statement, and return the IDs it changed.
 * Rows already read are left as they are (and are not part of the action,
 * so undo will not touch them). The IDs go in as one JSON parameter, so any
 * number of them fits under D1's parameter limit.
 */
export const markRead = async (db: Db, mark: MarkRead): Promise<number[]> => {
  const rows = await db.all<{ id: number }>(sql`
    update articles set read_at = ${mark.now}, read_action_id = ${mark.actionId}
    where id in (select value from json_each(${JSON.stringify(mark.ids)}))
      and read_at is null
      and (${mark.snapshotAt} is null or first_seen_at <= ${mark.snapshotAt})
    returning id
  `)

  return rows.map((row) => row.id)
}

/** Mark one article unread. Returns whether it changed. */
export const markUnread = async (
  db: Db,
  articleId: number
): Promise<boolean> => {
  const rows = await db.all<{ id: number }>(sql`
    update articles set read_at = null, read_action_id = null
    where id = ${articleId} and read_at is not null
    returning id
  `)

  return rows.length > 0
}

/**
 * Undo a mark-read action: exactly the articles still carrying its id go
 * back to unread. One marked unread, or read again by a later action, since
 * then no longer carries it and is left alone.
 */
export const undoMarkRead = async (
  db: Db,
  actionId: string
): Promise<number[]> => {
  const rows = await db.all<{ id: number }>(sql`
    update articles set read_at = null, read_action_id = null
    where read_action_id = ${actionId}
    returning id
  `)

  return rows.map((row) => row.id)
}
