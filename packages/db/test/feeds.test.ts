import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  countFeedHealth,
  createDb,
  listFeedsToSync,
  pruneArticles,
  recordFeedChanged,
  recordFeedFailure,
  recordFeedNotModified,
  schema,
  type Db,
  type StoredItem,
} from '#/index'
import { createTestD1 } from '#/testing'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const T0 = Date.UTC(2026, 10, 1)

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

const addFeed = async (url: string, createdAt = T0) => {
  const [feed] = await db
    .insert(schema.feeds)
    .values({ url, createdAt })
    .returning({ id: schema.feeds.id })

  if (feed === undefined) throw new Error('feed insert returned nothing')

  return feed.id
}

const item = (
  key: string,
  overrides: Partial<StoredItem> = {}
): StoredItem => ({
  itemKey: key,
  url: `https://example.com/${key}`,
  title: `Title ${key}`,
  author: null,
  contentHtml: `<p>${key}</p>`,
  excerpt: key,
  publishedAt: T0,
  contentHash: `hash-${key}`,
  ...overrides,
})

const changed = (feedId: number, items: readonly StoredItem[], now: number) =>
  recordFeedChanged(db, feedId, {
    items,
    title: 'Feed',
    siteUrl: 'https://example.com',
    etag: '"v1"',
    lastModified: null,
    httpStatus: 200,
    now,
  })

const articlesOf = (feedId: number) =>
  db
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.feedId, feedId))
    .orderBy(schema.articles.itemKey)

/** Each article's stored HTML, by item key (articles without content omitted). */
const contentOf = async (feedId: number) => {
  const rows = await db
    .select({
      itemKey: schema.articles.itemKey,
      html: schema.articleContent.html,
    })
    .from(schema.articleContent)
    .innerJoin(
      schema.articles,
      eq(schema.articles.id, schema.articleContent.articleId)
    )
    .where(eq(schema.articles.feedId, feedId))

  return new Map(rows.map((row) => [row.itemKey, row.html]))
}

const contentRowCount = async () =>
  (await db.select().from(schema.articleContent)).length

const feedRow = async (feedId: number) => {
  const [row] = await db
    .select()
    .from(schema.feeds)
    .where(eq(schema.feeds.id, feedId))

  if (row === undefined) throw new Error(`no feed ${feedId}`)

  return row
}

const markRead = (feedId: number, readAt: number) =>
  db
    .update(schema.articles)
    .set({ readAt, readActionId: 'action-1' })
    .where(eq(schema.articles.feedId, feedId))

const prunedKeys = async (feedId: number) => {
  const rows = await db
    .select({ itemKey: schema.prunedItems.itemKey })
    .from(schema.prunedItems)
    .where(eq(schema.prunedItems.feedId, feedId))

  return rows.map((row) => row.itemKey).toSorted()
}

const prune = (now: number) =>
  pruneArticles(db, {
    now,
    readRetentionMs: 14 * DAY,
    prunedItemRetentionMs: 30 * DAY,
  })

describe('recordFeedChanged', () => {
  test('stores new items unread and counts them', async () => {
    const feedId = await addFeed('https://a.test/feed')

    expect(await changed(feedId, [item('a'), item('b')], T0)).toEqual({
      newItems: 2,
    })

    const rows = await articlesOf(feedId)

    expect(rows.map((row) => [row.itemKey, row.readAt])).toEqual([
      ['a', null],
      ['b', null],
    ])
  })

  test('a re-fetch never creates duplicates', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)

    expect(await changed(feedId, [item('a'), item('b')], T0 + HOUR)).toEqual({
      newItems: 1,
    })
    expect(await articlesOf(feedId)).toHaveLength(2)
  })

  test('an article edited at its source keeps its read state, first-seen time and date', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0 + HOUR)

    const edited = item('a', {
      title: 'Edited',
      contentHash: 'hash-edited',
      publishedAt: T0 + 5 * DAY,
    })

    expect(await changed(feedId, [edited], T0 + 2 * HOUR)).toEqual({
      newItems: 0,
    })

    const [row] = await articlesOf(feedId)

    expect(row).toMatchObject({
      title: 'Edited',
      readAt: T0 + HOUR,
      readActionId: 'action-1',
      firstSeenAt: T0,
      publishedAt: T0,
      updatedAt: T0 + 2 * HOUR,
    })
  })

  test('an item with no date is dated when first seen, and keeps that date', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a', { publishedAt: null })], T0)
    await changed(
      feedId,
      [item('a', { publishedAt: null, contentHash: 'new' })],
      T0 + DAY
    )

    const [row] = await articlesOf(feedId)

    expect(row?.publishedAt).toBe(T0)
  })

  test('stores more items than D1 allows parameters in one statement', async () => {
    const feedId = await addFeed('https://a.test/feed')
    const many = Array.from({ length: 250 }, (_, i) => item(`item-${i}`))

    expect(await changed(feedId, many, T0)).toEqual({ newItems: 250 })
  })

  test("stores a fetch bigger than D1's limit on one value, split into chunks", async () => {
    const feedId = await addFeed('https://a.test/feed')
    // 250 articles of 10 KB: 2.5 MB of HTML, more than one 2 MB value holds.
    const body = 'x'.repeat(10_000)

    const big = Array.from({ length: 250 }, (_, i) =>
      item(`big-${i}`, { contentHtml: `<p>${i}${body}</p>` })
    )

    expect(await changed(feedId, big, T0)).toEqual({ newItems: 250 })

    const content = await contentOf(feedId)

    expect(content.size).toBe(250)
    expect(content.get('big-249')).toBe(`<p>249${body}</p>`)
  })

  test('records success and resets failures on the feed', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await recordFeedFailure(db, feedId, {
      errorType: 'http',
      message: '500 server error',
      httpStatus: 500,
      now: T0,
    })
    await changed(feedId, [item('a', { publishedAt: T0 - DAY })], T0 + HOUR)

    expect(await feedRow(feedId)).toMatchObject({
      title: 'Feed',
      etag: '"v1"',
      lastOutcome: 'ok',
      lastHttpStatus: 200,
      lastSuccessAt: T0 + HOUR,
      lastChangedAt: T0 + HOUR,
      lastPublishedAt: T0 - DAY,
      firstFailureAt: null,
      consecutiveFailures: 0,
      lastError: null,
    })
  })

  test('the newest published date only moves forward', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('new', { publishedAt: T0 })], T0)
    await changed(feedId, [item('old', { publishedAt: T0 - DAY })], T0 + HOUR)

    expect((await feedRow(feedId)).lastPublishedAt).toBe(T0)
  })
})

describe('article content', () => {
  test('lives in article_content, one row per article with content', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(
      feedId,
      [item('a'), item('no-content', { contentHtml: null })],
      T0
    )

    expect(await contentOf(feedId)).toEqual(new Map([['a', '<p>a</p>']]))
  })

  test('an edit replaces the content; an unchanged re-fetch keeps it', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await changed(
      feedId,
      [item('a', { contentHtml: '<p>edited</p>', contentHash: 'h2' })],
      T0 + HOUR
    )
    // Same hash: nothing changed, so nothing is rewritten.
    await changed(
      feedId,
      [item('a', { contentHtml: '<p>ignored</p>', contentHash: 'h2' })],
      T0 + 2 * HOUR
    )

    expect(await contentOf(feedId)).toEqual(new Map([['a', '<p>edited</p>']]))
  })

  test('an edit that drops the content removes it', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await changed(
      feedId,
      [item('a', { contentHtml: null, contentHash: 'h2' })],
      T0 + HOUR
    )

    expect(await contentRowCount()).toBe(0)
  })

  test('pruning an article removes its content, and it is not stored again', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0)
    await prune(T0 + 14 * DAY)

    expect(await contentRowCount()).toBe(0)

    await changed(feedId, [item('a', { contentHash: 'h2' })], T0 + 15 * DAY)

    expect(await contentRowCount()).toBe(0)
  })
})

describe('recordFeedFailure', () => {
  test('counts failures in a row and keeps the first failure time', async () => {
    const feedId = await addFeed('https://a.test/feed')

    for (const now of [T0, T0 + HOUR, T0 + 2 * HOUR]) {
      await recordFeedFailure(db, feedId, {
        errorType: 'timeout',
        message: 'timed out after 15 seconds',
        httpStatus: null,
        now,
      })
    }

    expect(await feedRow(feedId)).toMatchObject({
      lastOutcome: 'timeout',
      firstFailureAt: T0,
      consecutiveFailures: 3,
      lastError: 'timed out after 15 seconds',
      lastFetchedAt: T0 + 2 * HOUR,
      lastSuccessAt: null,
    })
  })
})

describe('recordFeedNotModified', () => {
  test('is a success that changes no articles', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await recordFeedNotModified(db, feedId, T0 + HOUR)

    expect(await feedRow(feedId)).toMatchObject({
      lastOutcome: 'not_modified',
      lastHttpStatus: 304,
      lastSuccessAt: T0 + HOUR,
      lastChangedAt: T0,
    })
    expect(await articlesOf(feedId)).toHaveLength(1)
  })
})

describe('pruning', () => {
  test('deletes read articles after retention, never unread ones', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('read'), item('unread')], T0)
    await db
      .update(schema.articles)
      .set({ readAt: T0 })
      .where(eq(schema.articles.itemKey, 'read'))

    expect(await prune(T0 + 13 * DAY)).toMatchObject({ articlesDeleted: 0 })
    expect(await prune(T0 + 14 * DAY)).toMatchObject({ articlesDeleted: 1 })

    const rows = await articlesOf(feedId)

    expect(rows.map((row) => row.itemKey)).toEqual(['unread'])
    expect(await prunedKeys(feedId)).toEqual(['read'])
  })

  test('a pruned article still in its feed never comes back as unread', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0)
    await prune(T0 + 14 * DAY)

    expect(
      await changed(
        feedId,
        [item('a', { contentHash: 'edited' })],
        T0 + 15 * DAY
      )
    ).toEqual({ newItems: 0 })
    expect(await articlesOf(feedId)).toHaveLength(0)
  })

  test('forgets a pruned key once its item has been gone from the feed for 30 days', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0)

    const prunedAt = T0 + 14 * DAY

    await prune(prunedAt)

    // The item has left the feed; later fetches succeed without it.
    await changed(feedId, [item('b')], prunedAt + DAY)
    await changed(feedId, [item('b'), item('c')], prunedAt + 29 * DAY)
    await prune(prunedAt + 29 * DAY)

    expect(await prunedKeys(feedId)).toEqual(['a'])

    await changed(feedId, [item('b'), item('c')], prunedAt + 30 * DAY)

    expect(await prune(prunedAt + 30 * DAY)).toMatchObject({
      prunedKeysDropped: 1,
    })
    expect(await prunedKeys(feedId)).toEqual([])
  })

  test('keeps a pruned key while the item is still in the feed', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0)
    await prune(T0 + 14 * DAY)
    await changed(feedId, [item('a')], T0 + 60 * DAY)

    expect(await prune(T0 + 60 * DAY)).toMatchObject({ prunedKeysDropped: 0 })
    expect(await prunedKeys(feedId)).toEqual(['a'])
  })

  test('a 304 counts as the item still being in the feed', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0)
    await prune(T0 + 14 * DAY)

    // The feed still lists `a`, so the next fetch is unchanged.
    await changed(feedId, [item('a')], T0 + 15 * DAY)
    await recordFeedNotModified(db, feedId, T0 + 60 * DAY)

    expect(await prune(T0 + 60 * DAY)).toMatchObject({ prunedKeysDropped: 0 })
  })

  test('a long outage does not forget pruned keys', async () => {
    const feedId = await addFeed('https://a.test/feed')

    await changed(feedId, [item('a')], T0)
    await markRead(feedId, T0)
    await prune(T0 + 14 * DAY)

    for (const day of [20, 40, 60]) {
      await recordFeedFailure(db, feedId, {
        errorType: 'http',
        message: '503 service unavailable',
        httpStatus: 503,
        now: T0 + day * DAY,
      })
    }

    expect(await prune(T0 + 60 * DAY)).toMatchObject({ prunedKeysDropped: 0 })
    expect(await prunedKeys(feedId)).toEqual(['a'])
  })
})

describe('listFeedsToSync', () => {
  test('never-fetched feeds first, then least recently fetched', async () => {
    const recent = await addFeed('https://recent.test/feed')
    const old = await addFeed('https://old.test/feed')
    const never = await addFeed('https://never.test/feed')

    await changed(recent, [], T0 + 2 * HOUR)
    await changed(old, [], T0 + HOUR)

    const order = await listFeedsToSync(db)

    expect(order.map((feed) => feed.id)).toEqual([never, old, recent])
  })
})

describe('countFeedHealth', () => {
  test('sorts feeds into healthy, stale and failing', async () => {
    const now = T0 + 100 * DAY

    const healthy = await addFeed('https://healthy.test/feed')
    const stale = await addFeed('https://stale.test/feed')
    const failing = await addFeed('https://failing.test/feed')

    await addFeed('https://never-synced-new.test/feed', now - HOUR)
    await addFeed('https://never-synced-old.test/feed', now - 3 * DAY)

    await changed(healthy, [item('h', { publishedAt: now - DAY })], now - HOUR)
    await changed(
      stale,
      [item('s', { publishedAt: now - 91 * DAY })],
      now - HOUR
    )
    await changed(failing, [item('f', { publishedAt: now })], now - 3 * DAY)

    expect(
      await countFeedHealth(db, {
        now,
        failingAfterMs: 2 * DAY,
        staleAfterMs: 90 * DAY,
      })
    ).toEqual({
      // The new, never-synced feed has no articles yet, so it reads stale.
      healthy: 1,
      stale: 2,
      failing: 2,
    })
  })
})
