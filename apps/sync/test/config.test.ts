import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import { describe, expect, test } from 'vitest'

import { SyncConfig, syncSettingsEnv } from '../src/config.ts'

const withEnv = <A, E>(
  effect: Effect.Effect<A, E>,
  env: Readonly<Record<string, string>>
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)))
    )
  )

const readSyncConfig = Effect.gen(function* () {
  return yield* SyncConfig
})

describe('SyncConfig', () => {
  test("defaults are the spec's", async () => {
    const { cron, settings } = await withEnv(readSyncConfig, {})

    expect(cron).toBe('17 * * * *')
    expect(settings).toMatchObject({
      skipWindowMs: 5 * 60_000,
      readRetentionMs: 14 * 24 * 3_600_000,
      failingAfterMs: 48 * 3_600_000,
      onDemandBudgetMs: 25_000,
      concurrency: 6,
    })
  })

  test('env vars override the defaults, in their own units', async () => {
    const { cron, settings } = await withEnv(readSyncConfig, {
      SYNC_CRON: '*/30 * * * *',
      SYNC_SKIP_WINDOW_MINUTES: '10',
      READ_RETENTION_DAYS: '7',
      FEED_FAILING_AFTER_HOURS: '24',
    })

    expect(cron).toBe('*/30 * * * *')
    expect(settings).toMatchObject({
      skipWindowMs: 10 * 60_000,
      readRetentionMs: 7 * 24 * 3_600_000,
      failingAfterMs: 24 * 3_600_000,
    })
  })
})

describe('syncSettingsEnv', () => {
  test('passes every setting to the Worker, overrides included', async () => {
    const env = await withEnv(syncSettingsEnv, {
      SYNC_SKIP_WINDOW_MINUTES: '7',
    })

    expect(env).toEqual({
      SYNC_CRON: '17 * * * *',
      SYNC_SKIP_WINDOW_MINUTES: '7',
      SYNC_SCHEDULED_BUDGET_SECONDS: '600',
      SYNC_ON_DEMAND_BUDGET_SECONDS: '25',
      SYNC_CONCURRENCY: '6',
      SYNC_FEED_TIMEOUT_SECONDS: '15',
      READ_RETENTION_DAYS: '14',
      PRUNED_ITEM_RETENTION_DAYS: '30',
      FEED_FAILING_AFTER_HOURS: '48',
      FEED_STALE_AFTER_DAYS: '90',
    })
  })

  test('what the Worker is given reads back as the same settings', async () => {
    const env = await withEnv(syncSettingsEnv, { READ_RETENTION_DAYS: '3' })
    const { settings } = await withEnv(readSyncConfig, env)

    expect(settings.readRetentionMs).toBe(3 * 24 * 3_600_000)
  })
})
