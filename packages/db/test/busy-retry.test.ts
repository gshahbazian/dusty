import { describe, expect, test } from 'vitest'

import { retryBusy, withBusyRetry } from '../src/busy-retry.ts'
import { createDb, insertFeed, listSubscriptions } from '../src/index.ts'
import { createTestD1 } from '../src/testing.ts'

const busy = () =>
  new Error(
    'D1_ERROR: database is locked: SQLITE_BUSY (extended: SQLITE_BUSY_SNAPSHOT)'
  )

describe('retryBusy', () => {
  test('tries again after SQLITE_BUSY, and returns the result', async () => {
    let calls = 0

    const result = await retryBusy(async () => {
      calls += 1

      if (calls < 3) throw busy()

      return 'ok'
    })

    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  test('also tries again when local D1 hides the busy error', async () => {
    // What workerd hands JavaScript when SQLITE_BUSY hits while local D1
    // reads the bookmark: the SQLite error itself only goes to its log.
    const hidden = new Error(
      'D1_ERROR: Failed to get session commit token: internal error; reference = d8a18bjf1o17a9a971hnp809'
    )

    let calls = 0

    const result = await retryBusy(async () => {
      calls += 1

      if (calls < 2) throw hidden

      return 'ok'
    })

    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  test('keeps trying for its time budget, then gives up', async () => {
    let calls = 0
    const started = Date.now()

    await expect(
      retryBusy(async () => {
        calls += 1
        throw busy()
      }, 300)
    ).rejects.toThrow('SQLITE_BUSY')

    const elapsed = Date.now() - started

    expect(elapsed).toBeGreaterThanOrEqual(300)
    expect(elapsed).toBeLessThan(1000)
    expect(calls).toBeGreaterThan(2)
  })

  test('outlasts a lock held for longer than a second', async () => {
    // Adding a 3,000-article feed holds the write lock for seconds locally.
    const lockedUntil = Date.now() + 1500
    let calls = 0

    const result = await retryBusy(async () => {
      calls += 1

      if (Date.now() < lockedUntil) throw busy()

      return 'ok'
    })

    expect(result).toBe('ok')
    expect(calls).toBeGreaterThan(5)
  })

  test('other errors are not retried', async () => {
    let calls = 0

    await expect(
      retryBusy(async () => {
        calls += 1
        throw new Error('no such table: feeds')
      })
    ).rejects.toThrow('no such table')
    expect(calls).toBe(1)
  })
})

describe('createDb with the retrying binding', () => {
  test('statements and batches still work through the wrapper', async () => {
    const testD1 = await createTestD1()
    const db = createDb(testD1.d1, { retryBusy: true })

    try {
      expect(
        await insertFeed(db, {
          url: 'https://a.test/feed',
          customTitle: null,
          now: 1,
        })
      ).toBe(1)
      expect(
        await db.batch([
          db.run('select 1'),
          db.all<{ two: number }>('select 2 as two'),
        ])
      ).toMatchObject([{ success: true }, [{ two: 2 }]])
      expect(
        await listSubscriptions(db, {
          now: 2,
          failingAfterMs: 1,
          staleAfterMs: 1,
        })
      ).toHaveLength(1)
    } finally {
      await testD1.dispose()
    }
  })

  test('sessions still work through the wrapper', async () => {
    const testD1 = await createTestD1()
    const wrapped = withBusyRetry(testD1.d1)

    try {
      expect(
        await wrapped.withSession().prepare('select 1 as one').first()
      ).toEqual({ one: 1 })
    } finally {
      await testD1.dispose()
    }
  })
})
