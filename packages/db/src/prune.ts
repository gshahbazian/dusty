import { sql } from 'drizzle-orm'

import type { Db } from './client.ts'

export interface PruneOptions {
  readonly now: number
  /** Read articles are deleted this long after they were read. */
  readonly readRetentionMs: number
  /**
   * A pruned key is forgotten once its item has been gone from the feed
   * this long.
   */
  readonly prunedItemRetentionMs: number
}

export interface PruneResult {
  readonly articlesDeleted: number
  readonly prunedKeysDropped: number
}

/**
 * Delete read articles past retention, remembering their keys so sync never
 * brings them back, then forget keys whose items have left their feed.
 *
 * A key is only forgotten if a successful fetch has happened since its item
 * was last seen. A feed that has been failing has not shown the item is gone,
 * so its keys stay however long the outage lasts.
 */
export const pruneArticles = async (
  db: Db,
  options: PruneOptions
): Promise<PruneResult> => {
  const { now } = options
  const readCutoff = now - options.readRetentionMs
  const prunedCutoff = now - options.prunedItemRetentionMs

  const [, deleted, dropped] = await db.batch([
    db.run(sql`
      insert into pruned_items (feed_id, item_key, pruned_at, last_seen_at)
      select feed_id, item_key, ${now}, ${now} from articles
      where read_at is not null and read_at <= ${readCutoff}
      on conflict do nothing
    `),
    db.run(sql`
      delete from articles
      where read_at is not null and read_at <= ${readCutoff}
    `),
    db.run(sql`
      delete from pruned_items
      where last_seen_at <= ${prunedCutoff}
        and last_seen_at < (
          select last_success_at from feeds where feeds.id = pruned_items.feed_id
        )
    `),
  ])

  return {
    articlesDeleted: deleted.meta.changes,
    prunedKeysDropped: dropped.meta.changes,
  }
}
