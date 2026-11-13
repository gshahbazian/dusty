import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/**
 * Times are stored as integer epoch milliseconds throughout the schema so SQL
 * can compare and subtract them directly.
 */

/**
 * One row (id = 1) that serialises sync runs. A run claims it by moving
 * `leaseUntil` into the future and writing its own `runId`; see
 * `claimSyncRun` in `sync-state.ts`.
 */
export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey(),
  runId: text('run_id'),
  lastStartedAt: integer('last_started_at').notNull(),
  leaseUntil: integer('lease_until').notNull(),
  lastFinishedAt: integer('last_finished_at'),
  lastTrigger: text('last_trigger'),
  lastOutcome: text('last_outcome'),
})

/**
 * A subscription, plus what fetching it has learned: conditional-request
 * state and the health fields the subscriptions view shows.
 */
export const feeds = sqliteTable(
  'feeds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull(),
    /** From the feed itself; the owner's rename lives in `customTitle`. */
    title: text('title'),
    customTitle: text('custom_title'),
    siteUrl: text('site_url'),
    createdAt: integer('created_at').notNull(),

    etag: text('etag'),
    lastModified: text('last_modified'),

    lastFetchedAt: integer('last_fetched_at'),
    /** `ok`, `not_modified`, or an error type (see `FetchErrorType`). */
    lastOutcome: text('last_outcome'),
    lastHttpStatus: integer('last_http_status'),
    /** Last fetch that worked: a 200 or a 304. */
    lastSuccessAt: integer('last_success_at'),
    /** Last 200: the last time the feed's content was read. */
    lastChangedAt: integer('last_changed_at'),
    /** Newest article date ever seen in the feed. */
    lastPublishedAt: integer('last_published_at'),
    firstFailureAt: integer('first_failure_at'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    /** The latest error in plain words, e.g. "404 not found". */
    lastError: text('last_error'),
  },
  (table) => [
    uniqueIndex('feeds_url_unique').on(table.url),
    index('feeds_last_fetched_at').on(table.lastFetchedAt),
  ]
)

/**
 * One row per feed item. Sync inserts and updates content, but never writes
 * `readAt` or `readActionId`, and never changes `firstSeenAt` after insert.
 */
export const articles = sqliteTable(
  'articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    feedId: integer('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    /** The item's guid or id, else its link, else a hash of title and date. */
    itemKey: text('item_key').notNull(),
    url: text('url'),
    title: text('title'),
    author: text('author'),
    /** Cleaned with a strict allowlist before it is stored. */
    contentHtml: text('content_html'),
    excerpt: text('excerpt'),
    publishedAt: integer('published_at').notNull(),
    /** When sync first stored it. M3's snapshot filter depends on this. */
    firstSeenAt: integer('first_seen_at').notNull(),
    /** Last time sync changed the stored content. */
    updatedAt: integer('updated_at').notNull(),
    contentHash: text('content_hash').notNull(),
    readAt: integer('read_at'),
    /** Which "mark read" action set `readAt`; undo matches on it. */
    readActionId: text('read_action_id'),
  },
  (table) => [
    uniqueIndex('articles_feed_item_unique').on(table.feedId, table.itemKey),
    index('articles_unread_by_published').on(
      table.readAt,
      table.publishedAt,
      table.id
    ),
    index('articles_feed_unread_by_published').on(
      table.feedId,
      table.readAt,
      table.publishedAt,
      table.id
    ),
  ]
)

/**
 * Keys of read articles that pruning deleted. Sync skips these keys, so a
 * deleted article still listed in its feed never comes back as unread. A
 * row is dropped once its item has been gone from the feed for a while.
 */
export const prunedItems = sqliteTable(
  'pruned_items',
  {
    feedId: integer('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    prunedAt: integer('pruned_at').notNull(),
    /** Last successful fetch whose feed still listed this item. */
    lastSeenAt: integer('last_seen_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.feedId, table.itemKey] }),
    index('pruned_items_last_seen_at').on(table.lastSeenAt),
  ]
)
