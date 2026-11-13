import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Times are stored as integer epoch milliseconds throughout the schema so SQL
 * can compare and subtract them directly.
 */

/**
 * One row (id = 1) that serialises sync runs. A run claims it by moving
 * `leaseUntil` into the future; see `claimSyncRun` in `sync-state.ts`.
 */
export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey(),
  lastStartedAt: integer('last_started_at').notNull(),
  leaseUntil: integer('lease_until').notNull(),
  lastFinishedAt: integer('last_finished_at'),
  lastTrigger: text('last_trigger'),
  lastOutcome: text('last_outcome'),
})
