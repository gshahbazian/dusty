import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import {
  findFeedByUrl,
  insertFeed,
  recordFeedChanged,
  recordFeedFailure,
  removeFeed,
  type Db,
  type FeedRef,
} from '@dusty/db'

import type { SyncSettings } from '#/config'
import { query } from '#/database'
import { findAdvertisedFeed, normalizeFeedUrl } from '#/discover'
import { FeedFetchError, fetchFeed } from '#/http'
import { plainTitle } from '#/items'
import { Metrics } from '#/metrics'
import { parse } from '#/sync-feed'

export type AddFeedResult =
  | {
      readonly status: 'added'
      readonly feed: FeedRef
      readonly itemsNew: number
    }
  /** Already subscribed: `feed` is the existing subscription. */
  | { readonly status: 'exists'; readonly feed: FeedRef }
  /**
   * Subscribed although its first fetch failed (`keepOnFailure`). It shows
   * as failing until a sync gets through.
   */
  | {
      readonly status: 'kept'
      readonly feed: FeedRef
      readonly reason: string
    }
  /** Not added; `reason` is in plain words for the owner. */
  | { readonly status: 'invalid'; readonly reason: string }

export interface AddFeedOptions {
  /** Follow a web page's advertised feed (adding by hand; not for OPML). */
  readonly discover: boolean
  /** A display title to keep when it differs from the feed's own (OPML). */
  readonly title: string | null
  /** Store the feed's current articles as already read (OPML import). */
  readonly articlesRead: boolean
  /**
   * Subscribe even if the feed can't be fetched or read right now (OPML
   * import: a feed that is down today should not drop out of a migration).
   */
  readonly keepOnFailure: boolean
}

/** A result, typed, so the union does not widen to a plain object. */
const invalid = (reason: string): AddFeedResult => ({
  status: 'invalid',
  reason,
})

const exists = (feed: FeedRef): AddFeedResult => ({ status: 'exists', feed })

/**
 * Subscribe to a feed and store its articles straight away. Runs outside the
 * sync lock and skip window: it only writes the new feed, which no running
 * sync has in its list. Nothing is stored unless the URL leads to a feed.
 */
export const addFeed = Effect.fn('sync.add_feed')(function* (
  db: Db,
  input: string,
  settings: SyncSettings,
  options: AddFeedOptions
) {
  const metrics = yield* Metrics
  const startedAt = yield* Clock.currentTimeMillis

  yield* Effect.annotateCurrentSpan('feed.input', input)

  const result: AddFeedResult = yield* subscribe(
    db,
    input,
    settings,
    options
  ).pipe(
    Effect.catchTag('FeedFetchError', (error) => {
      if (options.keepOnFailure) return keepFailing(db, input, error, options)

      return Effect.succeed(invalid(error.message))
    }),
    Effect.catchTag('DatabaseError', (error) =>
      Effect.logError('adding a feed failed').pipe(
        Effect.annotateLogs({
          input,
          operation: error.operation,
          error: error.detail,
        }),
        Effect.as(invalid('sync error, please try again'))
      )
    ),
    Effect.catchCause((cause) =>
      Effect.logError('adding a feed failed unexpectedly').pipe(
        Effect.annotateLogs({ input, error: Cause.pretty(cause) }),
        Effect.as(invalid('sync error, please try again'))
      )
    )
  )

  const durationMs = (yield* Clock.currentTimeMillis) - startedAt

  const fields = {
    trigger: 'new_subscription',
    input,
    status: result.status,
    duration_ms: durationMs,
    feed_id: 'feed' in result ? result.feed.id : undefined,
    feed_url: 'feed' in result ? result.feed.url : undefined,
    items_new: result.status === 'added' ? result.itemsNew : undefined,
    reason: 'reason' in result ? result.reason : undefined,
  }

  yield* Effect.annotateCurrentSpan(fields)
  yield* Effect.logInfo('feed add finished').pipe(Effect.annotateLogs(fields))

  if (result.status === 'added') {
    yield* metrics.feedFetched({
      trigger: 'new_subscription',
      feedId: result.feed.id,
      feedUrl: result.feed.url,
      outcome: 'ok',
      httpStatus: 200,
      durationMs,
      itemsFound: result.itemsNew,
      itemsNew: result.itemsNew,
    })
  }

  return result
})

const subscribe = Effect.fnUntraced(function* (
  db: Db,
  input: string,
  settings: SyncSettings,
  options: AddFeedOptions
) {
  const url = normalizeFeedUrl(input)

  if (url === null) return invalid('not a web address')

  const subscribed = yield* query('find_feed_by_url', () =>
    findFeedByUrl(db, url)
  )

  if (subscribed !== null) return exists(subscribed)

  const fetched = yield* fetchBody(url, settings)
  const now = yield* Clock.currentTimeMillis
  const direct = yield* parse(fetched.body, url, now).pipe(Effect.option)

  if (Option.isSome(direct)) {
    return yield* store(db, url, fetched, direct.value, now, options)
  }

  // Not a feed. Adding by hand also accepts a web page that advertises one.
  if (!options.discover) return invalid('not a valid feed')

  const advertised = findAdvertisedFeed(fetched.body, url)

  if (advertised === null) return invalid('no feed found at this address')

  const alreadyAdvertised = yield* query('find_feed_by_url', () =>
    findFeedByUrl(db, advertised)
  )

  if (alreadyAdvertised !== null) return exists(alreadyAdvertised)

  const feedBody = yield* fetchBody(advertised, settings)
  const feedNow = yield* Clock.currentTimeMillis
  const parsed = yield* parse(feedBody.body, advertised, feedNow)

  return yield* store(db, advertised, feedBody, parsed, feedNow, options)
})

const fetchBody = Effect.fnUntraced(function* (
  url: string,
  settings: SyncSettings
) {
  const fetched = yield* fetchFeed(
    { url, etag: null, lastModified: null },
    {
      userAgent: settings.userAgent,
      timeoutMs: settings.feedTimeoutMs,
      maxBytes: settings.maxFeedBytes,
    }
  )

  // Without a validator to send, the server has no reason to answer 304.
  if (fetched.kind === 'not_modified') {
    return yield* new FeedFetchError({
      errorType: 'http',
      message: 'unexpected 304 not modified',
      httpStatus: 304,
    })
  }

  return fetched
})

/** Subscribe anyway, with the failure recorded so health shows it. */
const keepFailing = Effect.fnUntraced(function* (
  db: Db,
  input: string,
  error: FeedFetchError,
  options: AddFeedOptions
) {
  const url = normalizeFeedUrl(input)

  if (url === null) return invalid(error.message)

  const now = yield* Clock.currentTimeMillis
  const customTitle = options.title === null ? null : plainTitle(options.title)

  const feedId = yield* query('insert_feed', () =>
    insertFeed(db, { url, customTitle, now })
  )

  if (feedId === null) {
    const existing = yield* query('find_feed_by_url', () =>
      findFeedByUrl(db, url)
    )

    if (existing !== null) return exists(existing)

    return invalid(error.message)
  }

  yield* query('record_feed_failure', () =>
    recordFeedFailure(db, feedId, {
      errorType: error.errorType,
      message: error.message,
      httpStatus: error.httpStatus,
      now,
    })
  )

  const kept: AddFeedResult = {
    status: 'kept',
    feed: { id: feedId, title: customTitle ?? url, url },
    reason: error.message,
  }

  return kept
})

type Fetched = Effect.Success<ReturnType<typeof fetchBody>>

type Parsed = Effect.Success<ReturnType<typeof parse>>

/** Insert the feed, then its articles. On a failure, take the feed back out. */
const store = Effect.fnUntraced(function* (
  db: Db,
  url: string,
  fetched: Fetched,
  parsed: Parsed,
  now: number,
  options: AddFeedOptions
) {
  const ownTitle = options.title === null ? null : plainTitle(options.title)

  const customTitle =
    ownTitle !== null && ownTitle !== parsed.title ? ownTitle : null

  const feedId = yield* query('insert_feed', () =>
    insertFeed(db, { url, customTitle, now })
  )

  // Someone else subscribed to it in the meantime.
  if (feedId === null) {
    const existing = yield* query('find_feed_by_url', () =>
      findFeedByUrl(db, url)
    )

    if (existing !== null) return exists(existing)

    return invalid('sync error, please try again')
  }

  const { newItems } = yield* query('record_feed_changed', () =>
    recordFeedChanged(db, feedId, {
      items: parsed.items,
      title: parsed.title,
      siteUrl: parsed.siteUrl,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      httpStatus: fetched.httpStatus,
      now,
      newArticlesRead: options.articlesRead,
    })
  ).pipe(
    Effect.tapError(() =>
      query('remove_feed', () => removeFeed(db, feedId)).pipe(Effect.ignore)
    )
  )

  const added: AddFeedResult = {
    status: 'added',
    feed: { id: feedId, title: customTitle ?? parsed.title ?? url, url },
    itemsNew: newItems,
  }

  return added
})

/** One OPML entry: a feed URL, and the title the old reader gave it. */
export interface ImportEntry {
  readonly url: string
  readonly title: string | null
}

export type ImportResult = {
  readonly url: string
  readonly title: string | null
} & (
  | { readonly status: 'added'; readonly feed: FeedRef }
  | { readonly status: 'skipped'; readonly feed: FeedRef | null }
  /** `feed` is set when it was subscribed anyway (it shows as failing). */
  | {
      readonly status: 'failed'
      readonly reason: string
      readonly feed: FeedRef | null
    }
)

/**
 * Import a batch of OPML entries. Each is added like `addFeed` (no web page
 * discovery), with its articles stored as read and its OPML title kept.
 * Entries already subscribed, or listed twice, are skipped. One that fails is
 * reported as failed but subscribed anyway, so it shows as failing.
 */
export const importFeeds = Effect.fn('sync.import_feeds')(function* (
  db: Db,
  entries: readonly ImportEntry[],
  settings: SyncSettings
) {
  yield* Effect.annotateCurrentSpan('import.entries', entries.length)

  const seen = new Set<string>()

  const unique = entries.filter((entry) => {
    const url = normalizeFeedUrl(entry.url) ?? entry.url
    const first = !seen.has(url)

    seen.add(url)

    return first
  })

  const imported = yield* Effect.forEach(
    unique,
    (entry) =>
      addFeed(db, entry.url, settings, {
        discover: false,
        title: entry.title,
        articlesRead: true,
        keepOnFailure: true,
      }).pipe(Effect.map((result) => toImportResult(entry, result))),
    { concurrency: settings.concurrency }
  )

  const duplicates = entries.flatMap((entry): ImportResult[] => {
    if (unique.includes(entry)) return []

    return [{ ...entry, status: 'skipped', feed: null }]
  })

  return [...imported, ...duplicates]
})

const toImportResult = (
  entry: ImportEntry,
  result: AddFeedResult
): ImportResult => {
  if (result.status === 'added') {
    return { ...entry, status: 'added', feed: result.feed }
  }

  if (result.status === 'exists') {
    return { ...entry, status: 'skipped', feed: result.feed }
  }

  if (result.status === 'kept') {
    return {
      ...entry,
      status: 'failed',
      reason: result.reason,
      feed: result.feed,
    }
  }

  return { ...entry, status: 'failed', reason: result.reason, feed: null }
}
