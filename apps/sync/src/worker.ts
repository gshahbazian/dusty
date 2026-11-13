import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { createDb, type SyncTrigger } from '@dusty/db'

import { Database } from '../../../infra/database.ts'
import { DEV_SYNC_PORT } from '../../../infra/dev.ts'
import { SyncConfig, syncSettingsEnv } from './config.ts'
import { Sync, type OnDemandTrigger } from './contract.ts'
import { HttpFetchLive } from './http.ts'
import { JsonLoggerLive } from './logger.ts'
import { Metrics, analyticsEngineMetrics } from './metrics.ts'
import { runSync } from './run.ts'

/**
 * Cloudflare's `tracing.startActiveSpan` is GA from this date; earlier dates
 * would silently drop our spans, and Alchemy refuses to deploy them.
 */
export const COMPATIBILITY_DATE = '2026-11-01'

/** A full scheduled run parses every feed; give it Workers' maximum CPU. */
const CPU_LIMIT_MS = 300_000

export default Sync.make(
  Effect.map(syncSettingsEnv, (env) => ({
    main: import.meta.url,
    env,
    compatibility: { date: COMPATIBILITY_DATE },
    // Internal only: reached through the web app's service binding and cron.
    workersDev: false,
    limits: { cpuMs: CPU_LIMIT_MS },
    observability: {
      enabled: true,
      traces: { enabled: true },
      logs: { enabled: true, invocationLogs: true },
    },
    dev: { port: DEV_SYNC_PORT, strictPort: true },
  })),
  Effect.gen(function* () {
    const { cron, settings } = yield* SyncConfig
    const d1 = yield* Cloudflare.D1.QueryDatabase(yield* Database)

    const metricsDataset = yield* Cloudflare.AnalyticsEngine.WriteDataset(
      yield* Cloudflare.AnalyticsEngine.Dataset('SyncMetrics', {
        dataset: 'dusty_sync',
      })
    )

    const run = (trigger: SyncTrigger) =>
      Effect.gen(function* () {
        const db = createDb(yield* d1.raw)
        const metrics = analyticsEngineMetrics(yield* metricsDataset.raw)

        return yield* runSync(db, trigger, settings).pipe(
          Effect.provide(
            Layer.mergeAll(Layer.succeed(Metrics, metrics), HttpFetchLive)
          )
        )
      })

    yield* Cloudflare.Workers.cron(cron, () =>
      run('scheduled').pipe(
        Effect.catchTag('DatabaseError', (error) =>
          Effect.logError('scheduled sync failed').pipe(
            Effect.annotateLogs({
              operation: error.operation,
              error: error.cause.message,
            })
          )
        ),
        // Handlers run in their own fibers, so the JSON logger is provided to
        // each one; providing it to the Worker setup is not enough.
        Effect.provide(JsonLoggerLive)
      )
    )

    return {
      syncNow: (trigger: OnDemandTrigger) =>
        run(trigger).pipe(Effect.orDie, Effect.provide(JsonLoggerLive)),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.AnalyticsEngine.WriteDatasetBinding,
        Cloudflare.Workers.CronEventSourceLive,
        Cloudflare.Telemetry()
      )
    )
  )
)
