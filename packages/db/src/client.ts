import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import { withBusyRetry } from './busy-retry.ts'
import * as schema from './schema.ts'

export type Db = DrizzleD1Database

/**
 * Wrap a D1 binding. Both the web app and the sync service use this. Calls
 * that hit SQLITE_BUSY (local dev only; see `busy-retry.ts`) are retried.
 */
export const createDb = (d1: D1Database): Db => drizzle(withBusyRetry(d1))

export { schema }
