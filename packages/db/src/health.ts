import { sql, type SQL } from 'drizzle-orm'

import type { Db } from '#/client'

export interface HealthOptions {
  readonly now: number
  /** A feed is failing after this long without a successful fetch. */
  readonly failingAfterMs: number
  /** A feed is stale when its newest article is older than this. */
  readonly staleAfterMs: number
}

export type FeedHealth = 'healthy' | 'stale' | 'failing'

/**
 * The health of a `feeds` row, as SQL, so every place that shows or counts
 * health (the subscriptions view, metrics) agrees.
 *
 * - failing: no successful fetch for `failingAfterMs`, counted from when the
 *   feed was added if it never succeeded.
 * - stale: not failing, but the newest article is older than `staleAfterMs`,
 *   or there are none.
 * - healthy: everything else.
 */
export const feedHealthSql = (options: HealthOptions): SQL<FeedHealth> => {
  const failingBefore = options.now - options.failingAfterMs
  const staleBefore = options.now - options.staleAfterMs

  return sql<FeedHealth>`case
    when coalesce(feeds.last_success_at, feeds.created_at) <= ${failingBefore}
      then 'failing'
    when coalesce(feeds.last_published_at, 0) <= ${staleBefore}
      then 'stale'
    else 'healthy'
  end`
}

export type HealthCounts = Readonly<Record<FeedHealth, number>>

/** How many feeds are healthy, stale and failing right now. */
export const countFeedHealth = async (
  db: Db,
  options: HealthOptions
): Promise<HealthCounts> => {
  const rows = await db.all<{ health: FeedHealth; count: number }>(sql`
    select ${feedHealthSql(options)} as health, count(*) as count
    from feeds
    group by health
  `)

  const counts = { healthy: 0, stale: 0, failing: 0 }

  for (const row of rows) counts[row.health] = row.count

  return counts
}
