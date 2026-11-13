import * as Effect from 'effect/Effect'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { createDb, type Db } from '@dusty/db'
import { createTestD1 } from '@dusty/db/testing'

import { runSync } from '../src/run.ts'

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

const run = (trigger: Parameters<typeof runSync>[1]) =>
  Effect.runPromise(runSync(db, trigger, 5))

test('an on-demand run right after another is skipped as recent', async () => {
  expect(await run('on_load')).toEqual({ status: 'ran', outcome: 'completed' })
  expect(await run('refresh')).toEqual({ status: 'skipped', reason: 'recent' })
})

test('the scheduled run is never skipped for recency', async () => {
  await run('on_load')

  expect(await run('scheduled')).toEqual({
    status: 'ran',
    outcome: 'completed',
  })
})
