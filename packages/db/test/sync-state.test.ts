import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { claimSyncRun, createDb, finishSyncRun, type Db } from '../src/index.ts'
import { createTestD1 } from '../src/testing.ts'

const LEASE = 60_000
const WINDOW = 5 * 60_000

let db: Db
let dispose: () => Promise<void>

beforeEach(async () => {
  const testD1 = await createTestD1()

  db = createDb(testD1.d1)
  dispose = testD1.dispose
})

afterEach(async () => {
  await dispose()
})

describe('claimSyncRun', () => {
  test('first claim wins', async () => {
    const result = await claimSyncRun(db, 'on_load', {
      now: 1_000_000,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })

    expect(result).toEqual({ claimed: true })
  })

  test('a second claim while a run holds the lease is refused as running', async () => {
    await claimSyncRun(db, 'on_load', {
      now: 1_000_000,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })

    const result = await claimSyncRun(db, 'scheduled', {
      now: 1_000_100,
      leaseMs: LEASE,
      skipWindowMs: 0,
    })

    expect(result).toEqual({ claimed: false, reason: 'running' })
  })

  test('an on-demand claim within the skip window is refused as recent', async () => {
    await claimSyncRun(db, 'on_load', {
      now: 1_000_000,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })
    await finishSyncRun(db, 'completed', 1_010_000)

    const result = await claimSyncRun(db, 'refresh', {
      now: 1_020_000,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })

    expect(result).toEqual({ claimed: false, reason: 'recent' })
  })

  test('the scheduled run ignores the skip window once the lease is free', async () => {
    await claimSyncRun(db, 'on_load', {
      now: 1_000_000,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })
    await finishSyncRun(db, 'completed', 1_010_000)

    const result = await claimSyncRun(db, 'scheduled', {
      now: 1_020_000,
      leaseMs: LEASE,
      skipWindowMs: 0,
    })

    expect(result).toEqual({ claimed: true })
  })

  test('an expired lease can be taken over', async () => {
    await claimSyncRun(db, 'on_load', {
      now: 1_000_000,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })

    const later = 1_000_000 + WINDOW + 1

    const result = await claimSyncRun(db, 'refresh', {
      now: later,
      leaseMs: LEASE,
      skipWindowMs: WINDOW,
    })

    expect(result).toEqual({ claimed: true })
  })

  test('concurrent claims: exactly one wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimSyncRun(db, 'on_load', {
          now: 1_000_000,
          leaseMs: LEASE,
          skipWindowMs: WINDOW,
        })
      )
    )

    expect(results.filter((result) => result.claimed)).toHaveLength(1)
  })
})
