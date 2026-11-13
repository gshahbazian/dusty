import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'

import {
  recordFeedChanged,
  recordFeedFailure,
  recordFeedNotModified,
  type Db,
  type FeedToSync,
  type SyncTrigger,
} from '@dusty/db'

import type { SyncSettings } from './config.ts'
import { query } from './database.ts'
import { FeedFetchError, fetchFeed } from './http.ts'
import { plainTitle, toStoredItems } from './items.ts'
import { Metrics, type FeedOutcome } from './metrics.ts'
import { InvalidFeed, parseFeed } from './parse.ts'

export interface FeedResult {
  readonly feedId: number
  readonly outcome: FeedOutcome
  readonly httpStatus: number | null
  readonly durationMs: number
  readonly itemsFound: number
  readonly itemsNew: number
}

type Stored = Omit<FeedResult, 'feedId' | 'durationMs'>

/**
 * Sync one feed: fetch, parse, store. Whatever goes wrong is recorded on the
 * feed and reported in the result; it never fails, so one broken feed cannot
 * stop the run. Logs and span attributes carry the same fields.
 */
export const syncFeed = Effect.fn('sync.feed')(function* (
  db: Db,
  feed: FeedToSync,
  trigger: SyncTrigger,
  settings: SyncSettings
) {
  const metrics = yield* Metrics
  const startedAt = yield* Clock.currentTimeMillis

  yield* Effect.annotateCurrentSpan({
    'feed.id': feed.id,
    'feed.url': feed.url,
    'sync.trigger': trigger,
  })

  const stored = yield* fetchAndStore(db, feed, settings).pipe(
    Effect.catchTag('FeedFetchError', (error) =>
      recordFailure(db, feed, error)
    ),
    Effect.catchTag('DatabaseError', (error) =>
      reportInternal(db, feed, `${error.operation}: ${error.cause.message}`)
    ),
    Effect.catchCause((cause) => reportInternal(db, feed, Cause.pretty(cause)))
  )

  const durationMs = (yield* Clock.currentTimeMillis) - startedAt
  const result: FeedResult = { feedId: feed.id, durationMs, ...stored }

  const fields = {
    feed_id: feed.id,
    feed_url: feed.url,
    trigger,
    outcome: result.outcome,
    http_status: result.httpStatus,
    duration_ms: durationMs,
    items_found: result.itemsFound,
    items_new: result.itemsNew,
  }

  yield* Effect.annotateCurrentSpan(fields)
  yield* Effect.logInfo('feed synced').pipe(Effect.annotateLogs(fields))
  yield* metrics.feedFetched({
    trigger,
    feedId: feed.id,
    feedUrl: feed.url,
    outcome: result.outcome,
    httpStatus: result.httpStatus,
    durationMs,
    itemsFound: result.itemsFound,
    itemsNew: result.itemsNew,
  })

  return result
})

const fetchAndStore = Effect.fnUntraced(function* (
  db: Db,
  feed: FeedToSync,
  settings: SyncSettings
) {
  const fetched = yield* fetchFeed(feed, {
    userAgent: settings.userAgent,
    timeoutMs: settings.feedTimeoutMs,
    maxBytes: settings.maxFeedBytes,
  })

  const now = yield* Clock.currentTimeMillis

  if (fetched.kind === 'not_modified') {
    yield* query('record_feed_not_modified', () =>
      recordFeedNotModified(db, feed.id, now)
    )

    const unchanged: Stored = {
      outcome: 'not_modified',
      httpStatus: 304,
      itemsFound: 0,
      itemsNew: 0,
    }

    return unchanged
  }

  const parsed = yield* parse(fetched.body, feed.url, now)

  const { newItems } = yield* query('record_feed_changed', () =>
    recordFeedChanged(db, feed.id, {
      items: parsed.items,
      title: parsed.title,
      siteUrl: parsed.siteUrl,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      httpStatus: fetched.httpStatus,
      now,
    })
  ).pipe(
    Effect.withSpan('feed.store', {
      attributes: { 'feed.id': feed.id, 'items.found': parsed.items.length },
    })
  )

  yield* Effect.annotateCurrentSpan('items.new', newItems)

  const changed: Stored = {
    outcome: 'ok',
    httpStatus: fetched.httpStatus,
    itemsFound: parsed.items.length,
    itemsNew: newItems,
  }

  return changed
})

/** Parse the body and prepare its items for storing (span `feed.parse`). */
export const parse = Effect.fn('feed.parse')(function* (
  body: string,
  feedUrl: string,
  now: number
) {
  const feed = yield* Effect.try({
    try: () => parseFeed(body, feedUrl),
    catch: (cause) =>
      new FeedFetchError({
        errorType: 'invalid_feed',
        message: 'not a valid feed',
        httpStatus: 200,
        detail:
          cause instanceof InvalidFeed ? String(cause.cause) : String(cause),
      }),
  })

  const items = yield* Effect.promise(() => toStoredItems(feed.items, now))

  yield* Effect.annotateCurrentSpan({
    'feed.format': feed.format,
    'items.found': items.length,
  })

  return { title: plainTitle(feed.title), siteUrl: feed.siteUrl, items }
})

const recordFailure = Effect.fnUntraced(function* (
  db: Db,
  feed: FeedToSync,
  error: FeedFetchError
) {
  const now = yield* Clock.currentTimeMillis

  yield* Effect.annotateCurrentSpan({
    'error.type': error.errorType,
    'error.message': error.message,
  })
  yield* Effect.logWarning('feed fetch failed').pipe(
    Effect.annotateLogs({
      feed_id: feed.id,
      feed_url: feed.url,
      error_type: error.errorType,
      error: error.message,
      error_detail: error.detail,
      http_status: error.httpStatus,
    })
  )

  yield* query('record_feed_failure', () =>
    recordFeedFailure(db, feed.id, {
      errorType: error.errorType,
      message: error.message,
      httpStatus: error.httpStatus,
      now,
    })
  ).pipe(Effect.ignore)

  const failed: Stored = {
    outcome: error.errorType,
    httpStatus: error.httpStatus,
    itemsFound: 0,
    itemsNew: 0,
  }

  return failed
})

/** A bug or a database failure while syncing this feed. Logged in full. */
const reportInternal = Effect.fnUntraced(function* (
  db: Db,
  feed: FeedToSync,
  detail: string
) {
  yield* Effect.logError('feed sync failed unexpectedly').pipe(
    Effect.annotateLogs({ feed_id: feed.id, feed_url: feed.url, error: detail })
  )

  return yield* recordFailure(
    db,
    feed,
    new FeedFetchError({
      errorType: 'internal',
      message: 'sync error',
      httpStatus: null,
      detail,
    })
  )
})
