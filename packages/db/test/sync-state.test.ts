import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  claimSyncRun,
  createDb,
  finishSyncRun,
  type Db,
  type SyncTrigger,
} from '../src/index.ts'
import { createTestD1 } from '../src/testing.ts'

const LEASE = 60_000
const WINDOW = 5 * 60_000
const START = 1_000_000

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

/** Claim as an on-demand trigger (with the skip window) unless scheduled. */
const claim = (runId: string, trigger: SyncTrigger, now: number) =>
  claimSyncRun(db, trigger, {
    runId,
    now,
    leaseMs: LEASE,
    skipWindowMs: trigger === 'scheduled' ? 0 : WINDOW,
  })

describe('claimSyncRun', () => {
  test('first claim wins', async () => {
    expect(await claim('a', 'on_load', START)).toEqual({ claimed: true })
  })

  test('a second claim while a run holds the lease is refused as running', async () => {
    await claim('a', 'on_load', START)

    expect(await claim('b', 'scheduled', START + 100)).toEqual({
      claimed: false,
      reason: 'running',
    })
  })

  test('an on-demand claim within the skip window is refused as recent', async () => {
    await claim('a', 'on_load', START)
    await finishSyncRun(db, 'a', 'completed', START + 10_000)

    expect(await claim('b', 'refresh', START + 20_000)).toEqual({
      claimed: false,
      reason: 'recent',
    })
  })

  test('the scheduled run ignores the skip window once the lease is free', async () => {
    await claim('a', 'on_load', START)
    await finishSyncRun(db, 'a', 'completed', START + 10_000)

    expect(await claim('b', 'scheduled', START + 20_000)).toEqual({
      claimed: true,
    })
  })

  test('an expired lease can be taken over', async () => {
    await claim('a', 'on_load', START)

    expect(await claim('b', 'refresh', START + WINDOW + 1)).toEqual({
      claimed: true,
    })
  })

  test('concurrent claims: exactly one wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => claim(`run-${i}`, 'on_load', START))
    )

    expect(results.filter((result) => result.claimed)).toHaveLength(1)
  })
})

describe('finishSyncRun', () => {
  test('the run holding the lock releases it', async () => {
    await claim('a', 'scheduled', START)

    expect(await finishSyncRun(db, 'a', 'completed', START + 1000)).toEqual({
      released: true,
    })
    expect(await claim('b', 'scheduled', START + 2000)).toEqual({
      claimed: true,
    })
  })

  test("a slow run whose lease expired cannot release the next run's lock", async () => {
    await claim('slow', 'scheduled', START)

    // The slow run's lease runs out and a second run takes over.
    const takeover = START + LEASE + 1

    await claim('second', 'scheduled', takeover)

    // The slow run finally finishes. It must not free the second run's lock.
    expect(
      await finishSyncRun(db, 'slow', 'completed', takeover + 1000)
    ).toEqual({ released: false })

    // So a third run is still refused while the second one runs.
    expect(await claim('third', 'scheduled', takeover + 2000)).toEqual({
      claimed: false,
      reason: 'running',
    })
  })
})
