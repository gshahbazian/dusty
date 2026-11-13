import { describe, expect, test } from 'vitest'

import { retryBusy } from '../src/busy-retry.ts'
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

  test('gives up after a few attempts', async () => {
    let calls = 0

    await expect(
      retryBusy(async () => {
        calls += 1
        throw busy()
      })
    ).rejects.toThrow('SQLITE_BUSY')
    expect(calls).toBe(5)
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
    const db = createDb(testD1.d1)

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
})
