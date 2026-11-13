import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { createDb } from '@dusty/db'

import { Database } from '../../../infra/database.ts'
import { DEV_SYNC_PORT } from '../../../infra/dev.ts'
import { SyncConfig } from './config.ts'
import { Sync, type OnDemandTrigger } from './contract.ts'
import { runSync } from './run.ts'

/**
 * Cloudflare's `tracing.startActiveSpan` is GA from this date; earlier dates
 * would silently drop our spans, and Alchemy refuses to deploy them.
 */
export const COMPATIBILITY_DATE = '2026-11-01'

export default Sync.make(
  {
    main: import.meta.url,
    compatibility: { date: COMPATIBILITY_DATE },
    // Internal only: reached through the web app's service binding and cron.
    workersDev: false,
    dev: { port: DEV_SYNC_PORT, strictPort: true },
  },
  Effect.gen(function* () {
    const config = yield* SyncConfig
    const d1 = yield* Cloudflare.D1.QueryDatabase(yield* Database)
    const db = Effect.map(d1.raw, createDb)

    const run = (trigger: Parameters<typeof runSync>[1]) =>
      Effect.flatMap(db, (client) =>
        runSync(client, trigger, config.skipWindowMinutes)
      )

    yield* Cloudflare.Workers.cron(config.cron, () =>
      run('scheduled').pipe(
        Effect.catchTag('DatabaseError', (error) =>
          Effect.logError('scheduled sync failed').pipe(
            Effect.annotateLogs({
              operation: error.operation,
              error: error.cause.message,
            })
          )
        )
      )
    )

    return {
      syncNow: (trigger: OnDemandTrigger) => run(trigger).pipe(Effect.orDie),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Workers.CronEventSourceLive,
        Cloudflare.Telemetry()
      )
    )
  )
)
