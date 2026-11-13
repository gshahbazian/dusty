import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import type { FetchErrorType, HealthCounts, SyncTrigger } from '@dusty/db'

export type FeedOutcome = 'ok' | 'not_modified' | FetchErrorType

export interface RunMetrics {
  readonly trigger: SyncTrigger
  readonly outcome: 'completed' | 'cut_short'
  readonly durationMs: number
  readonly feedsTotal: number
  readonly feedsOk: number
  readonly feedsFailed: number
  /** Feeds not started because the run's time budget ran out. */
  readonly feedsSkipped: number
  readonly itemsNew: number
  readonly articlesPruned: number
  readonly health: HealthCounts
}

export interface FeedMetrics {
  readonly trigger: SyncTrigger
  readonly feedId: number
  readonly feedUrl: string
  readonly outcome: FeedOutcome
  readonly httpStatus: number | null
  readonly durationMs: number
  readonly itemsFound: number
  readonly itemsNew: number
}

/**
 * Sync metrics. Deployed, they go to a Workers Analytics Engine dataset
 * (kept 3 months). The column layout below is what queries rely on; only
 * append to it.
 *
 * Run points: index `run`.
 * - blobs: kind (`run`), trigger, outcome
 * - doubles: duration_ms, feeds_total, feeds_ok, feeds_failed,
 *   feeds_skipped, items_new, articles_pruned, healthy, stale, failing
 *
 * Feed points: index = feed id.
 * - blobs: kind (`feed`), trigger, outcome, feed url
 * - doubles: duration_ms, http_status (0 when none), items_found, items_new
 */
export class Metrics extends Context.Service<
  Metrics,
  {
    readonly runFinished: (point: RunMetrics) => Effect.Effect<void>
    readonly feedFetched: (point: FeedMetrics) => Effect.Effect<void>
  }
>()('dusty/Metrics') {}

/** The write side of an Analytics Engine dataset, as the runtime gives it. */
export interface DataPointWriter {
  readonly writeDataPoint: (point: {
    readonly indexes: string[]
    readonly blobs: string[]
    readonly doubles: number[]
  }) => void
}

/** Metrics written to an Analytics Engine dataset. A failed write is logged. */
export const analyticsEngineMetrics = (dataset: DataPointWriter) => {
  const write = (
    point: Parameters<DataPointWriter['writeDataPoint']>[0]
  ): Effect.Effect<void> =>
    Effect.try({
      try: () => dataset.writeDataPoint(point),
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning('metrics write failed').pipe(
          Effect.annotateLogs({ error: String(cause) })
        )
      )
    )

  return Metrics.of({
    runFinished: (point) =>
      write({
        indexes: ['run'],
        blobs: ['run', point.trigger, point.outcome],
        doubles: [
          point.durationMs,
          point.feedsTotal,
          point.feedsOk,
          point.feedsFailed,
          point.feedsSkipped,
          point.itemsNew,
          point.articlesPruned,
          point.health.healthy,
          point.health.stale,
          point.health.failing,
        ],
      }),
    feedFetched: (point) =>
      write({
        indexes: [String(point.feedId)],
        blobs: ['feed', point.trigger, point.outcome, point.feedUrl],
        doubles: [
          point.durationMs,
          point.httpStatus ?? 0,
          point.itemsFound,
          point.itemsNew,
        ],
      }),
  })
}

/** Keeps every point in memory, for tests. */
export const recordingMetrics = () => {
  const runs: RunMetrics[] = []
  const feeds: FeedMetrics[] = []

  const layer = Layer.succeed(
    Metrics,
    Metrics.of({
      runFinished: (point) => Effect.sync(() => void runs.push(point)),
      feedFetched: (point) => Effect.sync(() => void feeds.push(point)),
    })
  )

  return { layer, runs, feeds }
}
