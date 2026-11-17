import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  createDb,
  getDailyBackdrop,
  saveDailyBackdrop,
  schema,
  type Db,
} from '#/index'
import { createTestD1 } from '#/testing'

const T0 = Date.UTC(2026, 10, 16)

const river = {
  imageUrl: 'https://images.unsplash.com/photo-river',
  alt: 'A river',
  color: '#405060',
}

const hills = {
  imageUrl: 'https://images.unsplash.com/photo-hills',
  alt: 'Green hills',
  color: null,
}

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

test('a day has no photo until one is saved', async () => {
  expect(await getDailyBackdrop(db, '2026-11-16')).toBeNull()

  expect(await saveDailyBackdrop(db, '2026-11-16', river, T0)).toEqual(river)
  expect(await getDailyBackdrop(db, '2026-11-16')).toEqual(river)
})

test("the first photo saved for a day stays that day's photo", async () => {
  await saveDailyBackdrop(db, '2026-11-16', river, T0)

  // A second fetch that raced the first gets the first one back.
  expect(await saveDailyBackdrop(db, '2026-11-16', hills, T0 + 1)).toEqual(
    river
  )
  expect(await getDailyBackdrop(db, '2026-11-16')).toEqual(river)
})

test("a new day's photo deletes the earlier days'", async () => {
  await saveDailyBackdrop(db, '2026-11-16', river, T0)
  await saveDailyBackdrop(db, '2026-11-17', hills, T0 + 86_400_000)

  expect(await getDailyBackdrop(db, '2026-11-16')).toBeNull()
  expect(await getDailyBackdrop(db, '2026-11-17')).toEqual(hills)
  expect(await db.select().from(schema.dailyBackdrops)).toHaveLength(1)
})

test("a tab still on yesterday never deletes today's photo", async () => {
  await saveDailyBackdrop(db, '2026-11-17', hills, T0 + 86_400_000)

  expect(await saveDailyBackdrop(db, '2026-11-16', river, T0)).toEqual(river)
  expect(await getDailyBackdrop(db, '2026-11-17')).toEqual(hills)
})
