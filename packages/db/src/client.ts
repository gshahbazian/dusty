import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import * as schema from './schema.ts'

export type Db = DrizzleD1Database

/** Wrap a D1 binding. Both the web app and the sync service use this. */
export const createDb = (d1: D1Database): Db => drizzle(d1)

export { schema }
