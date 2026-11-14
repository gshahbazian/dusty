export { createDb, schema, type Db } from '#/client'

export {
  getArticle,
  LIST_LIMIT,
  listArticles,
  markRead,
  markUnread,
  undoMarkRead,
  unreadCounts,
  type Article,
  type ArticleRow,
  type ListShow,
  type FeedCount,
  type MarkRead,
} from '#/articles'

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
} from '#/feeds'

export {
  countFeedHealth,
  feedHealthSql,
  type FeedHealth,
  type HealthCounts,
  type HealthOptions,
} from '#/health'

export { pruneArticles, type PruneOptions, type PruneResult } from '#/prune'

export {
  findFeedByUrl,
  insertFeed,
  listSubscriptions,
  removeFeed,
  renameFeed,
  type FeedRef,
  type Subscription,
} from '#/subscriptions'

export {
  claimSyncRun,
  finishSyncRun,
  type ClaimOptions,
  type ClaimResult,
  type SyncRunOutcome,
  type SyncTrigger,
} from '#/sync-state'
