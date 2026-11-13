import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  createDb,
  findFeedByUrl,
  insertFeed,
  listSubscriptions,
  pruneArticles,
  recordFeedChanged,
  recordFeedFailure,
  removeFeed,
  renameFeed,
  schema,
  type Db,
  type StoredItem,
} from '../src/index.ts'
import { createTestD1 } from '../src/testing.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 10, 20)

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

const add = async (url: string, createdAt = NOW, customTitle = null) => {
  const id = await insertFeed(db, { url, customTitle, now: createdAt })

  if (id === null) throw new Error(`${url} already subscribed`)

  return id
}

const item = (key: string, publishedAt = NOW - DAY): StoredItem => ({
  itemKey: key,
  url: `https://example.com/${key}`,
  title: key,
  author: null,
  contentHtml: `<p>${key}</p>`,
  excerpt: key,
  publishedAt,
  contentHash: `hash-${key}`,
})

const store = (
  feedId: number,
  items: readonly StoredItem[],
  options: { readonly now?: number; readonly newArticlesRead?: boolean } = {}
) =>
  recordFeedChanged(db, feedId, {
    items,
    title: 'Feed title',
    siteUrl: null,
    etag: null,
    lastModified: null,
    httpStatus: 200,
    now: options.now ?? NOW,
    newArticlesRead: options.newArticlesRead,
  })

const health = { now: NOW, failingAfterMs: 2 * DAY, staleAfterMs: 90 * DAY }

describe('adding', () => {
  test('a URL can only be subscribed once', async () => {
    const id = await add('https://a.test/feed')

    expect(
      await insertFeed(db, {
        url: 'https://a.test/feed',
        customTitle: null,
        now: NOW,
      })
    ).toBeNull()
    expect(await findFeedByUrl(db, 'https://a.test/feed')).toEqual({
      id,
      title: 'https://a.test/feed',
      url: 'https://a.test/feed',
    })
    expect(await findFeedByUrl(db, 'https://b.test/feed')).toBeNull()
  })

  test("imported articles arrive read; later ones don't", async () => {
    const id = await add('https://a.test/feed')

    await store(id, [item('old')], { newArticlesRead: true })
    await store(id, [item('old'), item('new')], { now: NOW + HOUR })

    const rows = await db
      .select({ key: schema.articles.itemKey, readAt: schema.articles.readAt })
      .from(schema.articles)
      .orderBy(schema.articles.itemKey)

    expect(rows).toEqual([
      { key: 'new', readAt: null },
      { key: 'old', readAt: NOW },
    ])
  })
})

describe('renaming', () => {
  test('sets the display title; an empty name goes back to the feed title', async () => {
    const id = await add('https://a.test/feed')

    await store(id, [])
    await renameFeed(db, id, '  My name  ')

    expect((await findFeedByUrl(db, 'https://a.test/feed'))?.title).toBe(
      'My name'
    )

    await renameFeed(db, id, '')

    expect((await findFeedByUrl(db, 'https://a.test/feed'))?.title).toBe(
      'Feed title'
    )
  })

  test('says when there was no such feed', async () => {
    expect(await renameFeed(db, 999, 'x')).toEqual({ renamed: false })
  })
})

describe('removing', () => {
  test('takes its articles, their content and its pruned keys with it', async () => {
    const id = await add('https://a.test/feed')
    const other = await add('https://b.test/feed')

    await store(id, [item('a'), item('b')])
    await store(other, [item('c')])
    await db
      .update(schema.articles)
      .set({ readAt: NOW - 20 * DAY })
      .where(eq(schema.articles.itemKey, 'a'))
    await pruneArticles(db, {
      now: NOW,
      readRetentionMs: 14 * DAY,
      prunedItemRetentionMs: 30 * DAY,
    })

    expect(await removeFeed(db, id)).toEqual({ removed: true })

    const articles = await db.select().from(schema.articles)
    const content = await db.select().from(schema.articleContent)
    const pruned = await db.select().from(schema.prunedItems)

    expect(articles.map((row) => row.itemKey)).toEqual(['c'])
    expect(content).toHaveLength(1)
    expect(pruned).toHaveLength(0)
    expect(await removeFeed(db, id)).toEqual({ removed: false })
  })
})

describe('listSubscriptions', () => {
  test('every feed with its unread count and health, sorted by name', async () => {
    const zebra = await add('https://zebra.test/feed')
    const apple = await add('https://apple.test/feed')
    const broken = await add('https://broken.test/feed', NOW - 3 * DAY)
    const quiet = await add('https://quiet.test/feed')

    await store(zebra, [item('z1'), item('z2'), item('z3')])
    await renameFeed(db, zebra, 'Zebra')
    await db
      .update(schema.articles)
      .set({ readAt: NOW })
      .where(eq(schema.articles.itemKey, 'z1'))
    await store(apple, [item('a1')])
    await renameFeed(db, apple, 'apple')
    await store(quiet, [item('q1', NOW - 100 * DAY)])
    await renameFeed(db, quiet, 'Quiet')
    await recordFeedFailure(db, broken, {
      errorType: 'http',
      message: '404 not found',
      httpStatus: 404,
      now: NOW - HOUR,
    })

    const rows = await listSubscriptions(db, health)

    expect(
      rows.map((row) => [row.title, row.unread, row.health, row.lastError])
    ).toEqual([
      ['apple', 1, 'healthy', null],
      ['https://broken.test/feed', 0, 'failing', '404 not found'],
      ['Quiet', 1, 'stale', null],
      ['Zebra', 2, 'healthy', null],
    ])
    expect(rows[1]).toMatchObject({
      firstFailureAt: NOW - HOUR,
      consecutiveFailures: 1,
      lastSuccessAt: null,
      feedTitle: null,
    })
    expect(rows[3]).toMatchObject({
      feedTitle: 'Feed title',
      customTitle: 'Zebra',
      lastSuccessAt: NOW,
      lastPublishedAt: NOW - DAY,
    })
  })
})
