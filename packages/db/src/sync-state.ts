import { and, eq, lte, or, sql } from 'drizzle-orm'

import type { Db } from './client.ts'
import { syncState } from './schema.ts'

const ROW_ID = 1

export type SyncTrigger =
  | 'scheduled'
  | 'on_load'
  | 'refresh'
  | 'new_subscription'

export type ClaimResult =
  | { readonly claimed: true }
  | { readonly claimed: false; readonly reason: 'running' | 'recent' }

export interface ClaimOptions {
  /** Identifies this run; only it can release the claim. */
  readonly runId: string
  readonly now: number
  /** How long the claim holds before another run may take over. */
  readonly leaseMs: number
  /**
   * Skip if the last run started less than this long ago. Pass 0 to ignore
   * (the scheduled run does this; it never skips for recency).
   */
  readonly skipWindowMs: number
}

/**
 * Atomically claim the right to run a sync. One statement both enforces the
 * skip-if-recent window and stops two runs from overlapping, so concurrent
 * callers cannot both win.
 */
export const claimSyncRun = async (
  db: Db,
  trigger: SyncTrigger,
  options: ClaimOptions
): Promise<ClaimResult> => {
  const { runId, now, leaseMs, skipWindowMs } = options

  const claimed = await db
    .insert(syncState)
    .values({
      id: ROW_ID,
      runId,
      lastStartedAt: now,
      leaseUntil: now + leaseMs,
      lastTrigger: trigger,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        runId,
        lastStartedAt: now,
        leaseUntil: now + leaseMs,
        lastTrigger: trigger,
        lastOutcome: null,
      },
      setWhere: and(
        lte(syncState.leaseUntil, now),
        or(
          sql`${skipWindowMs} = 0`,
          lte(syncState.lastStartedAt, now - skipWindowMs)
        )
      ),
    })
    .returning({ id: syncState.id })

  if (claimed.length > 0) return { claimed: true }

  const [current] = await db
    .select({ leaseUntil: syncState.leaseUntil })
    .from(syncState)
    .where(eq(syncState.id, ROW_ID))

  const running = current !== undefined && current.leaseUntil > now

  return { claimed: false, reason: running ? 'running' : 'recent' }
}

export type SyncRunOutcome = 'completed' | 'cut_short' | 'failed'

/**
 * Release the claim taken by `claimSyncRun` and record how the run ended.
 * Only the run that holds the claim can release it: if this run's lease ran
 * out and another run claimed the lock since, nothing changes and
 * `released` is false.
 */
export const finishSyncRun = async (
  db: Db,
  runId: string,
  outcome: SyncRunOutcome,
  now: number
): Promise<{ readonly released: boolean }> => {
  const released = await db
    .update(syncState)
    .set({ leaseUntil: now, lastFinishedAt: now, lastOutcome: outcome })
    .where(and(eq(syncState.id, ROW_ID), eq(syncState.runId, runId)))
    .returning({ id: syncState.id })

  return { released: released.length > 0 }
}
