import * as Cloudflare from '@alchemy.run/cloudflare'
import { AlchemyContext } from 'alchemy/AlchemyContext'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { createDb, type Db, type SyncTrigger } from '@dusty/db'

import { Database } from '../../../infra/database.ts'
import { DEV_SYNC_PORT } from '../../../infra/dev.ts'
import { addFeed, importFeeds, type ImportEntry } from './add-feed.ts'
import { SyncConfig, syncSettingsEnv } from './config.ts'
import { Sync, type OnDemandTrigger } from './contract.ts'
import { HttpFetch, HttpFetchLive } from './http.ts'
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
  Effect.gen(function* () {
    // Deploying (or `alchemy dev`) has the Alchemy context; the Worker
    // re-reads this config at runtime without it, where env isn't used.
    const context = yield* Effect.serviceOption(AlchemyContext)
    const dev = Option.isSome(context) && context.value.dev
    const env = yield* syncSettingsEnv

    return {
      main: import.meta.url,
      // LOCAL_DEV turns on the retry for local D1's lock (see busy-retry.ts).
      env: { ...env, LOCAL_DEV: dev ? 'true' : 'false' },
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
    }
  }),
  Effect.gen(function* () {
    const { cron, settings } = yield* SyncConfig

    const localDev = yield* Config.Boolean('LOCAL_DEV').pipe(
      Config.withDefault(false)
    )

    const d1 = yield* Cloudflare.D1.QueryDatabase(yield* Database)

    const metricsDataset = yield* Cloudflare.AnalyticsEngine.WriteDataset(
      yield* Cloudflare.AnalyticsEngine.Dataset('SyncMetrics', {
        dataset: 'dusty_sync',
      })
    )

    /**
     * Give a handler what every handler needs: the database, metrics and the
     * web. Handlers run in their own fibers, so the JSON logger is provided
     * to each one; providing it to the Worker setup is not enough.
     */
    const handle = <A, E>(
      work: (db: Db) => Effect.Effect<A, E, Metrics | HttpFetch>
    ) =>
      Effect.gen(function* () {
        const db = createDb(yield* d1.raw, { retryBusy: localDev })
        const metrics = analyticsEngineMetrics(yield* metricsDataset.raw)

        return yield* work(db).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(Metrics, metrics),
              HttpFetchLive,
              JsonLoggerLive
            )
          )
        )
      })

    const run = (trigger: SyncTrigger) =>
      handle((db) => runSync(db, trigger, settings))

    yield* Cloudflare.Workers.cron(cron, () =>
      run('scheduled').pipe(
        Effect.catchTag('DatabaseError', (error) =>
          Effect.logError('scheduled sync failed').pipe(
            Effect.annotateLogs({
              operation: error.operation,
              error: error.detail,
            })
          )
        ),
        Effect.provide(JsonLoggerLive)
      )
    )

    return {
      syncNow: (trigger: OnDemandTrigger) => run(trigger).pipe(Effect.orDie),
      addFeed: (url: string) =>
        handle((db) =>
          addFeed(db, url, settings, {
            discover: true,
            title: null,
            articlesRead: false,
            keepOnFailure: false,
          })
        ),
      importFeeds: (entries: readonly ImportEntry[]) =>
        handle((db) => importFeeds(db, entries, settings)),
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
