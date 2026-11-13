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
  const { now, leaseMs, skipWindowMs } = options

  const claimed = await db
    .insert(syncState)
    .values({
      id: ROW_ID,
      lastStartedAt: now,
      leaseUntil: now + leaseMs,
      lastTrigger: trigger,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
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

/** Release the claim taken by `claimSyncRun` and record how the run ended. */
export const finishSyncRun = async (
  db: Db,
  outcome: 'completed' | 'cut_short' | 'failed',
  now: number
): Promise<void> => {
  await db
    .update(syncState)
    .set({ leaseUntil: now, lastFinishedAt: now, lastOutcome: outcome })
    .where(eq(syncState.id, ROW_ID))
}
