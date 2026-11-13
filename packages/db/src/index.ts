export { createDb, schema, type Db } from './client.ts'

export {
  listFeedsToSync,
  recordFeedChanged,
  recordFeedFailure,
  recordFeedNotModified,
  type FeedChanged,
  type FeedFailure,
  type FeedToSync,
  type FetchErrorType,
  type StoredItem,
} from './feeds.ts'

export {
  countFeedHealth,
  feedHealthSql,
  type FeedHealth,
  type HealthCounts,
  type HealthOptions,
} from './health.ts'

export { pruneArticles, type PruneOptions, type PruneResult } from './prune.ts'

export {
  claimSyncRun,
  finishSyncRun,
  type ClaimOptions,
  type ClaimResult,
  type SyncRunOutcome,
  type SyncTrigger,
} from './sync-state.ts'
