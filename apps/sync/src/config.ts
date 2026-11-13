import * as Config from 'effect/Config'

/**
 * Sync settings the spec says must be configurable without code changes.
 * Values come from the environment (`.env` locally, the deploy environment
 * otherwise); the defaults are the spec's.
 */
export const SyncConfig = Config.all({
  /** Cron expression for the scheduled run. */
  cron: Config.String('SYNC_CRON').pipe(Config.withDefault('0 * * * *')),
  /** On-demand runs within this many minutes of the last start are skipped. */
  skipWindowMinutes: Config.Int('SYNC_SKIP_WINDOW_MINUTES').pipe(
    Config.withDefault(5)
  ),
})

/**
 * How long a run's claim on the sync lock lasts. Runs end well before this;
 * it only matters if a run dies without releasing the lock.
 */
export const SYNC_LEASE_MS = 15 * 60_000
