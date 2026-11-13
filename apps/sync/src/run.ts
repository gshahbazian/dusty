import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'

import {
  claimSyncRun,
  countFeedHealth,
  finishSyncRun,
  listFeedsToSync,
  pruneArticles,
  type Db,
  type SyncTrigger,
} from '@dusty/db'

import type { SyncSettings } from './config.ts'
import type { SyncRunResult } from './contract.ts'
import { query } from './database.ts'
import { Metrics } from './metrics.ts'
import { syncFeed, type FeedResult } from './sync-feed.ts'

/** A feed the run did not start because its time budget ran out. */
const NOT_STARTED = 'not_started'

/**
 * One sync run, traced as one `sync.run` span:
 *
 * 1. Claim the lock with a fresh run id, or skip (already running, or an
 *    on-demand run too soon after the last one).
 * 2. Sync feeds, least recently fetched first, a few at a time. Once the time
 *    budget is spent no new feed starts, and the run ends `cut_short`; the
 *    next run continues with the feeds this one did not reach.
 * 3. Prune read articles, count feed health, write the run's metrics.
 * 4. Release the lock, if this run still holds it.
 */
export const runSync = Effect.fn('sync.run')(function* (
  db: Db,
  trigger: SyncTrigger,
  settings: SyncSettings
) {
  const metrics = yield* Metrics
  const runId = crypto.randomUUID()
  const startedAt = yield* Clock.currentTimeMillis

  yield* Effect.annotateCurrentSpan({
    'sync.trigger': trigger,
    'sync.run_id': runId,
  })

  const budgetMs = runBudgetMs(trigger, settings)

  const claim = yield* query('claim_sync_run', () =>
    claimSyncRun(db, trigger, {
      runId,
      now: startedAt,
      leaseMs: budgetMs + settings.leaseMarginMs,
      skipWindowMs: trigger === 'scheduled' ? 0 : settings.skipWindowMs,
    })
  )

  if (!claim.claimed) {
    yield* Effect.annotateCurrentSpan({
      'sync.outcome': 'skipped',
      'sync.skip_reason': claim.reason,
    })
    yield* Effect.logInfo('sync run skipped').pipe(
      Effect.annotateLogs({ trigger, outcome: 'skipped', reason: claim.reason })
    )

    const skipped: SyncRunResult = { status: 'skipped', reason: claim.reason }

    return skipped
  }

  const deadline = startedAt + budgetMs
  const feeds = yield* query('list_feeds_to_sync', () => listFeedsToSync(db))

  const results = yield* Effect.forEach(
    feeds,
    (feed) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis

        // Only start a feed if its fetch can time out before the deadline.
        if (now + settings.feedTimeoutMs > deadline) return NOT_STARTED

        return yield* syncFeed(db, feed, trigger, settings)
      }),
    { concurrency: settings.concurrency }
  )

  const synced = results.filter(
    (result): result is FeedResult => result !== NOT_STARTED
  )

  const feedsSkipped = results.length - synced.length
  const feedsOk = synced.filter((result) => isSuccess(result)).length
  const itemsNew = synced.reduce((sum, result) => sum + result.itemsNew, 0)
  const outcome = feedsSkipped > 0 ? 'cut_short' : 'completed'

  const pruned = yield* prune(db, settings)
  const healthAt = yield* Clock.currentTimeMillis

  const health = yield* query('count_feed_health', () =>
    countFeedHealth(db, {
      now: healthAt,
      failingAfterMs: settings.failingAfterMs,
      staleAfterMs: settings.staleAfterMs,
    })
  ).pipe(Effect.withSpan('sync.health'))

  const finishedAt = yield* Clock.currentTimeMillis
  const durationMs = finishedAt - startedAt

  const { released } = yield* query('finish_sync_run', () =>
    finishSyncRun(db, runId, outcome, finishedAt)
  )

  const fields = {
    trigger,
    run_id: runId,
    outcome,
    duration_ms: durationMs,
    feeds_total: feeds.length,
    feeds_ok: feedsOk,
    feeds_failed: synced.length - feedsOk,
    feeds_skipped: feedsSkipped,
    items_new: itemsNew,
    articles_pruned: pruned.articlesDeleted,
    feeds_healthy: health.healthy,
    feeds_stale: health.stale,
    feeds_failing: health.failing,
  }

  yield* Effect.annotateCurrentSpan(fields)

  if (outcome === 'cut_short') {
    yield* Effect.logWarning('sync run cut short: time budget spent').pipe(
      Effect.annotateLogs({ ...fields, budget_ms: budgetMs })
    )
  }

  if (!released) {
    yield* Effect.logWarning(
      'sync lock was taken over by another run before this one finished'
    ).pipe(Effect.annotateLogs(fields))
  }

  yield* Effect.logInfo('sync run finished').pipe(Effect.annotateLogs(fields))
  yield* metrics.runFinished({
    trigger,
    outcome,
    durationMs,
    feedsTotal: feeds.length,
    feedsOk,
    feedsFailed: synced.length - feedsOk,
    feedsSkipped,
    itemsNew,
    articlesPruned: pruned.articlesDeleted,
    health,
  })

  const ran: SyncRunResult = {
    status: 'ran',
    outcome,
    feedsSynced: synced.length,
    feedsFailed: synced.length - feedsOk,
    feedsSkipped,
    itemsNew,
  }

  return ran
})

/** How long a run may take, last feed included. */
export const runBudgetMs = (
  trigger: SyncTrigger,
  settings: SyncSettings
): number => {
  if (trigger === 'scheduled') return settings.scheduledBudgetMs

  return settings.onDemandBudgetMs
}

const isSuccess = (result: FeedResult): boolean =>
  result.outcome === 'ok' || result.outcome === 'not_modified'

const prune = Effect.fn('sync.prune')(function* (
  db: Db,
  settings: SyncSettings
) {
  const now = yield* Clock.currentTimeMillis

  const result = yield* query('prune_articles', () =>
    pruneArticles(db, {
      now,
      readRetentionMs: settings.readRetentionMs,
      prunedItemRetentionMs: settings.prunedItemRetentionMs,
    })
  )

  yield* Effect.annotateCurrentSpan({
    'prune.articles_deleted': result.articlesDeleted,
    'prune.keys_dropped': result.prunedKeysDropped,
  })

  return result
})
