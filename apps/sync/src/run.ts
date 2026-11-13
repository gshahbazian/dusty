import * as Clock from 'effect/Clock'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

import {
  claimSyncRun,
  finishSyncRun,
  type Db,
  type SyncTrigger,
} from '@dusty/db'

import { SYNC_LEASE_MS } from './config.ts'
import type { SyncRunResult } from './contract.ts'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: Error
}> {}

const query = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new DatabaseError({
        operation,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      }),
  }).pipe(Effect.withSpan(`db.${operation}`))

/**
 * One sync run: claim the lock (or skip), sync every feed, release the lock.
 * Each run is one trace; per-feed spans arrive in M1.
 */
export const runSync = Effect.fn('sync.run')(function* (
  db: Db,
  trigger: SyncTrigger,
  skipWindowMinutes: number
) {
  yield* Effect.annotateCurrentSpan('sync.trigger', trigger)

  const startedAt = yield* Clock.currentTimeMillis
  const skipWindowMs = trigger === 'scheduled' ? 0 : skipWindowMinutes * 60_000

  const claim = yield* query('claim_sync_run', () =>
    claimSyncRun(db, trigger, {
      now: startedAt,
      leaseMs: SYNC_LEASE_MS,
      skipWindowMs,
    })
  )

  if (!claim.claimed) {
    yield* Effect.annotateCurrentSpan('sync.outcome', 'skipped')
    yield* Effect.annotateCurrentSpan('sync.skip_reason', claim.reason)
    yield* Effect.logInfo('sync run skipped').pipe(
      Effect.annotateLogs({ trigger, outcome: 'skipped', reason: claim.reason })
    )

    const skipped: SyncRunResult = { status: 'skipped', reason: claim.reason }

    return skipped
  }

  // M1: fetch, parse and store each feed here, inside its own span.

  const finishedAt = yield* Clock.currentTimeMillis

  yield* query('finish_sync_run', () =>
    finishSyncRun(db, 'completed', finishedAt)
  )
  yield* Effect.annotateCurrentSpan('sync.outcome', 'completed')
  yield* Effect.logInfo('sync run finished').pipe(
    Effect.annotateLogs({
      trigger,
      outcome: 'completed',
      durationMs: finishedAt - startedAt,
    })
  )

  const ran: SyncRunResult = { status: 'ran', outcome: 'completed' }

  return ran
})
