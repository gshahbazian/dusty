import { createDb, type Db } from '@dusty/db'

import type { WebEnv } from '~/alchemy.run'

/**
 * The database for a request. The retry for local D1's lock is on only
 * under `alchemy dev` (see `packages/db/src/busy-retry.ts`).
 */
export const dbFor = (env: WebEnv): Db =>
  createDb(env.DB, { retryBusy: env.LOCAL_DEV === 'true' })
