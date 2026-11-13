import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Everything a sync run needs to know, with durations in milliseconds. */
export interface SyncSettings {
  /** On-demand runs within this long of the last start are skipped. */
  readonly skipWindowMs: number
  /**
   * How much longer than its budget a run's claim on the sync lock lasts:
   * time to prune, count health and release the lock after the last feed.
   */
  readonly leaseMarginMs: number
  /** A scheduled run, last feed included, ends within this long. */
  readonly scheduledBudgetMs: number
  /**
   * An on-demand run, last feed included, ends within this long. It runs in
   * the web app's `waitUntil`, which Cloudflare stops 30 s after the page's
   * response, so this must stay under 30 s minus `leaseMarginMs`'s work.
   */
  readonly onDemandBudgetMs: number
  /** Feeds fetched at once (Workers allow 6 open connections). */
  readonly concurrency: number
  readonly feedTimeoutMs: number
  readonly maxFeedBytes: number
  readonly userAgent: string
  readonly readRetentionMs: number
  readonly prunedItemRetentionMs: number
  readonly failingAfterMs: number
  readonly staleAfterMs: number
}

/**
 * Sync settings the spec says must be configurable without code changes,
 * with their defaults (the spec's, or `docs/002_m1_sync_design.md`'s where
 * the spec gives none). All are whole numbers in the unit their name says.
 */
export const SETTING_DEFAULTS = {
  SYNC_SKIP_WINDOW_MINUTES: 5,
  SYNC_SCHEDULED_BUDGET_SECONDS: 600,
  SYNC_ON_DEMAND_BUDGET_SECONDS: 25,
  SYNC_CONCURRENCY: 6,
  SYNC_FEED_TIMEOUT_SECONDS: 15,
  READ_RETENTION_DAYS: 14,
  PRUNED_ITEM_RETENTION_DAYS: 30,
  FEED_FAILING_AFTER_HOURS: 48,
  FEED_STALE_AFTER_DAYS: 90,
} as const

type SettingName = keyof typeof SETTING_DEFAULTS

const SETTING_NAMES = Object.keys(SETTING_DEFAULTS).filter(
  (name): name is SettingName => Object.hasOwn(SETTING_DEFAULTS, name)
)

const int = (name: SettingName) =>
  Config.Int(name).pipe(Config.withDefault(SETTING_DEFAULTS[name]))

const cronConfig = Config.String('SYNC_CRON').pipe(
  Config.withDefault('0 * * * *')
)

/**
 * The settings as Worker env vars, read where `alchemy deploy` or
 * `alchemy dev` runs (`.env` or the shell). Alchemy does not carry `Config`
 * values read in a Worker's setup into the deployed Worker, so the Worker's
 * props pass them as plain env vars, and `SyncConfig` reads them back there.
 */
export const syncSettingsEnv = Effect.gen(function* () {
  const settings = yield* Effect.forEach(SETTING_NAMES, (name) =>
    Effect.map(int(name), (value) => [name, String(value)] as const)
  )

  return Object.fromEntries([['SYNC_CRON', yield* cronConfig], ...settings])
})

/** The settings, read from the Worker's env at runtime. */
export const SyncConfig = Config.all({
  /** Cron expression for the scheduled run. */
  cron: cronConfig,
  settings: Config.all({
    skipWindowMinutes: int('SYNC_SKIP_WINDOW_MINUTES'),
    scheduledBudgetSeconds: int('SYNC_SCHEDULED_BUDGET_SECONDS'),
    onDemandBudgetSeconds: int('SYNC_ON_DEMAND_BUDGET_SECONDS'),
    concurrency: int('SYNC_CONCURRENCY'),
    feedTimeoutSeconds: int('SYNC_FEED_TIMEOUT_SECONDS'),
    readRetentionDays: int('READ_RETENTION_DAYS'),
    prunedItemRetentionDays: int('PRUNED_ITEM_RETENTION_DAYS'),
    failingAfterHours: int('FEED_FAILING_AFTER_HOURS'),
    staleAfterDays: int('FEED_STALE_AFTER_DAYS'),
  }).pipe(Config.map(toSettings)),
})

interface RawSettings {
  readonly skipWindowMinutes: number
  readonly scheduledBudgetSeconds: number
  readonly onDemandBudgetSeconds: number
  readonly concurrency: number
  readonly feedTimeoutSeconds: number
  readonly readRetentionDays: number
  readonly prunedItemRetentionDays: number
  readonly failingAfterHours: number
  readonly staleAfterDays: number
}

function toSettings(raw: RawSettings): SyncSettings {
  return {
    skipWindowMs: raw.skipWindowMinutes * MINUTE,
    leaseMarginMs: LEASE_MARGIN_MS,
    scheduledBudgetMs: raw.scheduledBudgetSeconds * 1000,
    onDemandBudgetMs: raw.onDemandBudgetSeconds * 1000,
    concurrency: raw.concurrency,
    feedTimeoutMs: raw.feedTimeoutSeconds * 1000,
    maxFeedBytes: MAX_FEED_BYTES,
    userAgent: USER_AGENT,
    readRetentionMs: raw.readRetentionDays * DAY,
    prunedItemRetentionMs: raw.prunedItemRetentionDays * DAY,
    failingAfterMs: raw.failingAfterHours * HOUR,
    staleAfterMs: raw.staleAfterDays * DAY,
  }
}

/**
 * A run's lock lasts its budget plus this. A run that is killed (on-demand
 * runs are, at Cloudflare's 30 s limit) blocks the next one only briefly.
 */
export const LEASE_MARGIN_MS = 10_000

/** Feeds bigger than this are refused as too large. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024

/** Sent with every fetch, so feed hosts can tell what is asking. */
export const USER_AGENT = 'Dusty/1.0 (personal RSS reader)'
