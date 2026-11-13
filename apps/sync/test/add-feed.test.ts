import { asc } from 'drizzle-orm'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { claimSyncRun, createDb, schema, type Db } from '@dusty/db'
import { createTestD1 } from '@dusty/db/testing'

import {
  addFeed,
  importFeeds,
  type AddFeedOptions,
  type ImportEntry,
} from '../src/add-feed.ts'
import { findAdvertisedFeed, normalizeFeedUrl } from '../src/discover.ts'
import { recordingMetrics } from '../src/metrics.ts'
import {
  fakeWeb,
  fixture,
  serve,
  testSettings,
  type Handler,
} from './support.ts'

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

const BLOG = 'https://blog.example.com'

/** A small web: a blog home page that advertises its feeds, and the feeds. */
const blogWeb = {
  [`${BLOG}/`]: async () =>
    new Response(await fixture('site.html'), {
      headers: { 'content-type': 'text/html' },
    }),
  [`${BLOG}/rss.xml`]: serve('rss.xml'),
  [`${BLOG}/atom.xml`]: serve('atom.xml'),
  [`${BLOG}/about`]: () =>
    new Response('<html><body>no feed here</body></html>', {
      headers: { 'content-type': 'text/html' },
    }),
  [`${BLOG}/gone`]: () => new Response('', { status: 404 }),
} satisfies Readonly<Record<string, Handler>>

const byHand: AddFeedOptions = {
  discover: true,
  title: null,
  articlesRead: false,
  keepOnFailure: false,
}

const provide = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  routes: Readonly<Record<string, Handler>>
) => {
  const web = fakeWeb(routes)
  const metrics = recordingMetrics()

  const run = effect.pipe(
    Effect.provide(Layer.mergeAll(web.layer, metrics.layer))
  )

  return { run, web, metrics }
}

const add = async (
  url: string,
  routes: Readonly<Record<string, Handler>> = blogWeb
) => {
  const { run, web, metrics } = provide(
    addFeed(db, url, testSettings(), byHand),
    routes
  )

  return { result: await Effect.runPromise(run), web, metrics }
}

const feeds = () => db.select().from(schema.feeds).orderBy(schema.feeds.id)

const articles = () =>
  db
    .select({
      feedId: schema.articles.feedId,
      itemKey: schema.articles.itemKey,
      readAt: schema.articles.readAt,
    })
    .from(schema.articles)
    .orderBy(asc(schema.articles.feedId), asc(schema.articles.itemKey))

describe('normalizeFeedUrl', () => {
  test.each([
    ['blog.example.com/feed', 'https://blog.example.com/feed'],
    ['  https://blog.example.com  ', 'https://blog.example.com/'],
    ['http://localhost:5175/rss.xml', 'http://localhost:5175/rss.xml'],
  ])('%s becomes %s', (input, url) => {
    expect(normalizeFeedUrl(input)).toBe(url)
  })

  test.each([
    '',
    '   ',
    'javascript:alert(1)',
    'ftp://example.com/feed',
    'mailto:a@b.c',
  ])('%j is not a web address', (input) => {
    expect(normalizeFeedUrl(input)).toBeNull()
  })
})

describe('findAdvertisedFeed', () => {
  test('the first advertised feed, resolved against the page', async () => {
    const html = (await fixture('site.html')).toString()

    expect(findAdvertisedFeed(html, `${BLOG}/posts/1`)).toBe(`${BLOG}/rss.xml`)
  })

  test('stylesheets and other links are not feeds', () => {
    const html =
      '<link rel="stylesheet" href="/a.css"><link rel="alternate" hreflang="fr" href="/fr/">'

    expect(findAdvertisedFeed(html, BLOG)).toBeNull()
  })

  test('a javascript: feed link is ignored', () => {
    const html =
      '<link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">'

    expect(findAdvertisedFeed(html, BLOG)).toBeNull()
  })
})

describe('addFeed', () => {
  test('a feed URL is subscribed and its articles stored straight away', async () => {
    const { result, metrics } = await add(`${BLOG}/rss.xml`)

    expect(result).toMatchObject({
      status: 'added',
      feed: { title: 'Example RSS', url: `${BLOG}/rss.xml` },
      itemsNew: 3,
    })
    expect(await feeds()).toMatchObject([
      { url: `${BLOG}/rss.xml`, title: 'Example RSS', lastOutcome: 'ok' },
    ])
    expect((await articles()).map((row) => row.readAt)).toEqual([
      null,
      null,
      null,
    ])
    expect(metrics.feeds).toMatchObject([
      { trigger: 'new_subscription', outcome: 'ok', itemsNew: 3 },
    ])
  })

  test("a site's home page leads to the feed it advertises", async () => {
    const { result, web } = await add('blog.example.com')

    expect(result).toMatchObject({
      status: 'added',
      feed: { url: `${BLOG}/rss.xml`, title: 'Example RSS' },
    })
    expect(web.requests.map((request) => request.url)).toEqual([
      `${BLOG}/`,
      `${BLOG}/rss.xml`,
    ])
  })

  test('the same feed twice is refused, pointing at the one already there', async () => {
    const first = await add(`${BLOG}/rss.xml`)
    const second = await add(`${BLOG}/rss.xml`)

    expect(second.result).toEqual({
      status: 'exists',
      feed: {
        id: first.result.status === 'added' ? first.result.feed.id : -1,
        title: 'Example RSS',
        url: `${BLOG}/rss.xml`,
      },
    })
    // Refused before fetching anything.
    expect(second.web.requests).toHaveLength(0)
  })

  test('a home page whose feed is already subscribed is refused too', async () => {
    await add(`${BLOG}/rss.xml`)

    const { result } = await add(BLOG)

    expect(result).toMatchObject({
      status: 'exists',
      feed: { url: `${BLOG}/rss.xml` },
    })
    expect(await feeds()).toHaveLength(1)
  })

  test.each([
    [`${BLOG}/about`, 'no feed found at this address'],
    [`${BLOG}/gone`, '404 not found'],
    ['https://nowhere.example.com/feed', 'could not connect'],
    ['javascript:alert(1)', 'not a web address'],
  ])('%s is refused (%s) and nothing is stored', async (url, reason) => {
    const { result } = await add(url)

    expect(result).toEqual({ status: 'invalid', reason })
    expect(await feeds()).toHaveLength(0)
  })

  test('runs even while a full sync holds the lock', async () => {
    await claimSyncRun(db, 'scheduled', {
      runId: 'busy',
      now: Date.now(),
      leaseMs: 60_000,
      skipWindowMs: 0,
    })

    const { result } = await add(`${BLOG}/rss.xml`)

    expect(result.status).toBe('added')
  })
})

describe('importFeeds', () => {
  const entries: readonly ImportEntry[] = [
    { url: `${BLOG}/rss.xml`, title: 'My RSS name' },
    { url: `${BLOG}/atom.xml`, title: 'Example Atom' },
    { url: `${BLOG}/gone`, title: 'Gone' },
    { url: `${BLOG}/rss.xml`, title: 'RSS again' },
  ]

  const runImport = async (batch: readonly ImportEntry[]) => {
    const { run } = provide(importFeeds(db, batch, testSettings()), blogWeb)

    return Effect.runPromise(run)
  }

  test('adds feeds with their articles read, and reports what was skipped or failed', async () => {
    const results = await runImport(entries)

    expect(results.map((result) => [result.url, result.status])).toEqual([
      [`${BLOG}/rss.xml`, 'added'],
      [`${BLOG}/atom.xml`, 'added'],
      [`${BLOG}/gone`, 'failed'],
      [`${BLOG}/rss.xml`, 'skipped'],
    ])
    expect(results[2]).toMatchObject({
      reason: '404 not found',
      feed: { url: `${BLOG}/gone`, title: 'Gone' },
    })

    const stored = await articles()

    expect(stored).toHaveLength(5)
    expect(stored.every((row) => row.readAt !== null)).toBe(true)
  })

  test("keeps the old reader's name when it differs from the feed's own", async () => {
    await runImport(entries)

    // Imports run in parallel, so ids don't follow file order; go by URL.
    const rows = (await feeds()).toSorted((a, b) => a.url.localeCompare(b.url))

    expect(rows.map((row) => [row.url, row.title, row.customTitle])).toEqual([
      [`${BLOG}/atom.xml`, 'Example Atom', null],
      [`${BLOG}/gone`, null, 'Gone'],
      [`${BLOG}/rss.xml`, 'Example RSS', 'My RSS name'],
    ])
  })

  test('a feed that is already subscribed is skipped', async () => {
    await add(`${BLOG}/rss.xml`)

    const results = await runImport(entries.slice(0, 1))

    expect(results).toMatchObject([
      { status: 'skipped', feed: { url: `${BLOG}/rss.xml` } },
    ])
    // Its articles keep the read state they had (unread here).
    const stored = await articles()

    expect(stored).toHaveLength(3)
    expect(stored.every((row) => row.readAt === null)).toBe(true)
  })

  test('a feed that fails is subscribed anyway, with its failure recorded', async () => {
    await runImport([{ url: `${BLOG}/gone`, title: 'Gone' }])

    expect(await feeds()).toMatchObject([
      {
        url: `${BLOG}/gone`,
        customTitle: 'Gone',
        lastOutcome: 'http',
        lastError: '404 not found',
        consecutiveFailures: 1,
        lastSuccessAt: null,
      },
    ])
  })

  test('an entry that is not a web address is not subscribed', async () => {
    const results = await runImport([
      { url: 'javascript:alert(1)', title: 'X' },
    ])

    expect(results).toMatchObject([
      { status: 'failed', reason: 'not a web address', feed: null },
    ])
    expect(await feeds()).toHaveLength(0)
  })

  test('does not follow web pages: OPML lists feed URLs', async () => {
    const results = await runImport([{ url: `${BLOG}/`, title: 'Blog' }])

    expect(results).toMatchObject([
      { status: 'failed', reason: 'not a valid feed' },
    ])
  })
})
