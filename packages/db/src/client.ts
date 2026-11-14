import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import { withBusyRetry } from '#/busy-retry'
import * as schema from '#/schema'

export type Db = DrizzleD1Database

/**
 * Wrap a D1 binding. Both the web app and the sync service use this. Under
 * `alchemy dev` (and only there) they pass `retryBusy`, so calls that hit
 * the local SQLite lock are retried; see `busy-retry.ts`.
 */
export const createDb = (
  d1: D1Database,
  options: { readonly retryBusy?: boolean } = {}
): Db => drizzle(options.retryBusy === true ? withBusyRetry(d1) : d1)

export { schema }
