import { asc, eq, getTableColumns } from 'drizzle-orm'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createDb, schema, type Db, type SyncTrigger } from '@dusty/db'
import { createTestD1 } from '@dusty/db/testing'

import type { SyncSettings } from '#/config'
import { recordingMetrics } from '#/metrics'
import { runSync } from '#/run'
import { fakeWeb, hang, serve, testSettings, type Handler } from '#test/support'

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

const addFeed = async (url: string, createdAt = Date.now()) => {
  const [feed] = await db
    .insert(schema.feeds)
    .values({ url, createdAt })
    .returning({ id: schema.feeds.id })

  if (feed === undefined) throw new Error('feed insert returned nothing')

  return feed.id
}

/** Run a sync against a fake web, returning the result and what it recorded. */
const sync = async (
  routes: Readonly<Record<string, Handler>>,
  options: {
    readonly trigger?: SyncTrigger
    readonly settings?: Partial<SyncSettings>
  } = {}
) => {
  const web = fakeWeb(routes)
  const metrics = recordingMetrics()

  const result = await Effect.runPromise(
    runSync(
      db,
      options.trigger ?? 'scheduled',
      testSettings(options.settings)
    ).pipe(Effect.provide(Layer.mergeAll(web.layer, metrics.layer)))
  )

  return { result, requests: web.requests, metrics }
}

/** A feed's articles, each with its HTML from `article_content` (or null). */
const articlesOf = (feedId: number) =>
  db
    .select({
      ...getTableColumns(schema.articles),
      contentHtml: schema.articleContent.html,
    })
    .from(schema.articles)
    .leftJoin(
      schema.articleContent,
      eq(schema.articleContent.articleId, schema.articles.id)
    )
    .where(eq(schema.articles.feedId, feedId))
    .orderBy(asc(schema.articles.publishedAt), asc(schema.articles.id))

const feedRow = async (feedId: number) => {
  const [row] = await db
    .select()
    .from(schema.feeds)
    .where(eq(schema.feeds.id, feedId))

  if (row === undefined) throw new Error(`no feed ${feedId}`)

  return row
}

describe('feed formats', () => {
  test('RSS 2.0: content, plain titles, absolute links, dates and fallback keys', async () => {
    const feedId = await addFeed('https://rss.example.com/feed.xml')

    await sync({ 'https://rss.example.com/feed.xml': serve('rss.xml') })

    const rows = await articlesOf(feedId)

    expect(rows.map((row) => [row.itemKey, row.title])).toEqual([
      ['https://rss.example.com/posts/link-only', 'No guid, only a link'],
      ['rss-1', 'Fish & chips'],
      [expect.stringMatching(/^hash:/), 'Neither guid nor link, nor a date'],
    ])

    const [linkOnly, fish, undated] = rows

    expect(fish).toMatchObject({
      url: 'https://rss.example.com/posts/fish',
      author: 'Ann Author',
      publishedAt: Date.UTC(2026, 10, 3, 10),
      contentHtml:
        '<p>Full <strong>post</strong> with an <img src="https://rss.example.com/img/fish.png" alt="fish"> image.</p>',
      excerpt: 'Full post with an image.',
      readAt: null,
    })
    expect(linkOnly?.contentHtml).toBe(
      '<p>Escaped <em>HTML</em> description</p>'
    )
    expect(undated?.publishedAt).toBe(undated?.firstSeenAt)

    expect(await feedRow(feedId)).toMatchObject({
      title: 'Example RSS',
      siteUrl: 'https://rss.example.com/',
      lastOutcome: 'ok',
    })
  })

  test('Atom: html titles become text, text content is escaped, links resolve', async () => {
    const feedId = await addFeed('https://atom.example.com/feed.xml')

    await sync({ 'https://atom.example.com/feed.xml': serve('atom.xml') })

    const [second, first] = await articlesOf(feedId)

    expect(first).toMatchObject({
      itemKey: 'urn:example:atom:1',
      title: 'An HTML title',
      url: 'https://atom.example.com/2026/11/first',
      author: 'Bo Writer',
      publishedAt: Date.UTC(2026, 10, 4, 8),
      contentHtml:
        '<p>Atom <a href="https://atom.example.com/about">content</a></p>',
    })
    expect(second).toMatchObject({
      itemKey: 'urn:example:atom:2',
      publishedAt: Date.UTC(2026, 10, 3, 8),
      contentHtml: '<p>1 &lt; 2 is true</p>',
    })
    expect((await feedRow(feedId)).siteUrl).toBe('https://atom.example.com/')
  })

  test('RSS 1.0 (RDF)', async () => {
    const feedId = await addFeed('https://rdf.example.com/rss')

    await sync({ 'https://rdf.example.com/rss': serve('rdf.xml') })

    expect(await articlesOf(feedId)).toMatchObject([
      {
        itemKey: 'https://rdf.example.com/one',
        title: 'RDF one',
        author: 'Cy',
        publishedAt: Date.UTC(2026, 10, 1),
      },
    ])
  })

  test('JSON Feed', async () => {
    const feedId = await addFeed('https://json.example.com/feed.json')

    await sync({
      'https://json.example.com/feed.json': serve('feed.json', {
        'content-type': 'application/feed+json',
      }),
    })

    expect(await articlesOf(feedId)).toMatchObject([
      { itemKey: 'json-1', contentHtml: '<p>JSON <b>content</b></p>' },
      { itemKey: 'json-2', contentHtml: '<p>Plain &lt;text&gt;</p>' },
    ])
  })

  test('a Latin-1 feed is decoded from its XML declaration', async () => {
    const feedId = await addFeed('https://latin1.example.com/feed')

    await sync({ 'https://latin1.example.com/feed': serve('latin1.xml') })

    const [row] = await articlesOf(feedId)

    expect(row?.title).toBe('Crème brûlée')
    expect(row?.excerpt).toBe('Déjà vu for 5€')
    expect((await feedRow(feedId)).title).toBe('Café')
  })

  test('hostile content is cleaned before it is stored', async () => {
    const feedId = await addFeed('https://hostile.example.com/feed')

    await sync({ 'https://hostile.example.com/feed': serve('hostile.xml') })

    const rows = await articlesOf(feedId)
    const row = rows.find((article) => article.itemKey === 'hostile-1')
    const sneaky = rows.find((article) => article.itemKey === 'hostile-2')
    const html = row?.contentHtml ?? ''

    // A javascript: article link is not stored, so it can never be an href.
    expect(sneaky?.url).toBeNull()

    expect(row?.title).toBe('Click me')
    expect((await feedRow(feedId)).title).toBe('Hostile')
    expect(html).not.toMatch(/script|onclick|onload|javascript:|iframe|style/i)
    expect(html).toContain('<p>Hi</p>')
    expect(html).toContain('<a>bad link</a>')
    expect(html).toContain('<img src="https://tracker.test/pixel.gif">')
    // A date in 2099 is not believed: the article is dated when first seen.
    expect(row?.publishedAt).toBe(row?.firstSeenAt)
    // Nor is a javascript: site link.
    expect((await feedRow(feedId)).siteUrl).toBeNull()
  })
})

describe('a run', () => {
  test('one broken or slow feed never stops the others', async () => {
    const good = await addFeed('https://rss.example.com/feed.xml')
    const notFound = await addFeed('https://gone.example.com/feed')
    const slow = await addFeed('https://slow.example.com/feed')
    const notAFeed = await addFeed('https://html.example.com/')
    const unreachable = await addFeed('https://nowhere.example.com/feed')

    const { result, metrics } = await sync(
      {
        'https://rss.example.com/feed.xml': serve('rss.xml'),
        'https://gone.example.com/feed': () =>
          new Response('nope', { status: 404 }),
        'https://slow.example.com/feed': hang,
        'https://html.example.com/': () =>
          new Response('<html><body>hello</body></html>', {
            headers: { 'content-type': 'text/html' },
          }),
      },
      { settings: { feedTimeoutMs: 100 } }
    )

    expect(result).toEqual({
      status: 'ran',
      outcome: 'completed',
      feedsSynced: 5,
      feedsFailed: 4,
      feedsSkipped: 0,
      itemsNew: 3,
    })
    expect(await articlesOf(good)).toHaveLength(3)

    const failures = await Promise.all(
      [notFound, slow, notAFeed, unreachable].map(async (id) => {
        const row = await feedRow(id)

        return [row.lastOutcome, row.lastError, row.consecutiveFailures]
      })
    )

    expect(failures).toEqual([
      ['http', '404 not found', 1],
      ['timeout', 'timed out after 0 seconds', 1],
      ['invalid_feed', 'not a valid feed', 1],
      ['network', 'could not connect', 1],
    ])

    const outcomes = new Map(
      metrics.feeds.map((point) => [point.feedId, point.outcome])
    )

    expect(outcomes).toEqual(
      new Map([
        [good, 'ok'],
        [notFound, 'http'],
        [slow, 'timeout'],
        [notAFeed, 'invalid_feed'],
        [unreachable, 'network'],
      ])
    )
    expect(metrics.runs).toMatchObject([
      {
        trigger: 'scheduled',
        outcome: 'completed',
        feedsTotal: 5,
        feedsOk: 1,
        feedsFailed: 4,
        itemsNew: 3,
      },
    ])
  })

  test('sends a clear user agent and conditional request headers', async () => {
    const feedId = await addFeed('https://rss.example.com/feed.xml')
    const url = 'https://rss.example.com/feed.xml'
    const etag = '"abc"'
    const lastModified = 'Tue, 03 Nov 2026 10:00:00 GMT'

    await sync({
      [url]: serve('rss.xml', { etag, 'last-modified': lastModified }),
    })

    const second = await sync({
      [url]: (request) => {
        if (request.headers.get('if-none-match') === etag) {
          return new Response(null, { status: 304 })
        }

        return new Response('unexpected', { status: 500 })
      },
    })

    const [request] = second.requests

    expect(request?.headers.get('user-agent')).toBe('Dusty-test')
    expect(request?.headers.get('if-modified-since')).toBe(lastModified)
    expect(second.metrics.feeds).toMatchObject([{ outcome: 'not_modified' }])
    expect(await feedRow(feedId)).toMatchObject({
      lastOutcome: 'not_modified',
      lastHttpStatus: 304,
    })
    expect(await articlesOf(feedId)).toHaveLength(3)
  })

  test('a feed bigger than the size cap is refused', async () => {
    const feedId = await addFeed('https://big.example.com/feed')

    await sync(
      {
        'https://big.example.com/feed': () =>
          new Response('x'.repeat(2048), {
            headers: { 'content-type': 'application/xml' },
          }),
      },
      { settings: { maxFeedBytes: 1024 } }
    )

    expect(await feedRow(feedId)).toMatchObject({
      lastOutcome: 'too_large',
      lastError: 'larger than 1 KB',
    })
  })

  test('an on-demand run right after another is skipped as recent', async () => {
    await sync({}, { trigger: 'on_load' })

    const second = await sync({}, { trigger: 'refresh' })

    expect(second.result).toEqual({ status: 'skipped', reason: 'recent' })
  })

  test('the scheduled run is never skipped for recency', async () => {
    await sync({}, { trigger: 'on_load' })

    const second = await sync({})

    expect(second.result).toMatchObject({ status: 'ran', outcome: 'completed' })
  })

  test('a feed only starts if its whole timeout fits in the budget, and the next run picks up the rest', async () => {
    const slow = await addFeed('https://slow.example.com/feed')
    const waiting = await addFeed('https://rss.example.com/feed.xml')

    const routes = {
      'https://slow.example.com/feed': async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))

        return new Response(null, { status: 304 })
      },
      'https://rss.example.com/feed.xml': serve('rss.xml'),
    } satisfies Readonly<Record<string, Handler>>

    // The first feed starts almost at once (its 500 ms timeout fits in the
    // 800 ms budget) and takes 400 ms. By then a second fetch could run past
    // 900 ms, beyond the budget, so it does not start.
    //
    // Each local D1 call takes 10 to 40 ms (Miniflare over HTTP), and a run
    // makes about six of them around the feed. The budget leaves ~300 ms for
    // them so this measures the engine, not how fast the machine is.
    const budget = {
      concurrency: 1,
      feedTimeoutMs: 500,
      scheduledBudgetMs: 800,
    }

    const first = await sync(routes, { settings: budget })

    expect(first.result).toMatchObject({
      status: 'ran',
      outcome: 'cut_short',
      feedsSynced: 1,
      feedsSkipped: 1,
    })
    expect(first.metrics.runs).toMatchObject([
      { outcome: 'cut_short', feedsSkipped: 1 },
    ])
    expect(first.metrics.runs[0]?.durationMs).toBeLessThan(800)
    expect(await articlesOf(waiting)).toHaveLength(0)

    const second = await sync(routes, { settings: { concurrency: 1 } })

    // The feed the first run never reached goes first.
    expect(second.requests.map((request) => request.url)).toEqual([
      'https://rss.example.com/feed.xml',
      'https://slow.example.com/feed',
    ])
    expect(second.result).toMatchObject({ outcome: 'completed' })
    expect(await articlesOf(waiting)).toHaveLength(3)
    expect((await feedRow(slow)).lastOutcome).toBe('not_modified')
  })

  test("a run's lock lasts its budget plus a margin, not a fixed 15 minutes", async () => {
    await addFeed('https://rss.example.com/feed.xml')

    let lease: number | undefined

    await sync(
      {
        'https://rss.example.com/feed.xml': async () => {
          // Look at the lock while the run holds it.
          const [state] = await db.select().from(schema.syncState)

          lease = (state?.leaseUntil ?? 0) - (state?.lastStartedAt ?? 0)

          return new Response(null, { status: 304 })
        },
      },
      {
        trigger: 'on_load',
        settings: { onDemandBudgetMs: 25_000, leaseMarginMs: 10_000 },
      }
    )

    // If Cloudflare kills this run at its 30 s limit, the lock frees up by
    // 35 s, instead of blocking every sync for 15 minutes.
    expect(lease).toBe(35_000)
  })

  test('an article too big to store keeps its title, excerpt and link, without the HTML', async () => {
    const feedId = await addFeed('https://huge.example.com/feed')
    const huge = `<p>start ${'word '.repeat(100_000)}</p>`

    await sync({
      'https://huge.example.com/feed': () =>
        new Response(
          `<rss version="2.0"><channel><title>H</title><item><guid>huge</guid><title>Huge post</title><link>https://huge.example.com/1</link><description><![CDATA[${huge}]]></description></item></channel></rss>`
        ),
    })

    const [row] = await articlesOf(feedId)

    expect(row).toMatchObject({
      title: 'Huge post',
      url: 'https://huge.example.com/1',
      contentHtml: null,
    })
    expect(row?.excerpt?.startsWith('start word word')).toBe(true)
  })

  test('an item with no id or link stays one article when its content is edited', async () => {
    const feedId = await addFeed('https://bare.example.com/feed')

    const bare = (content: string) => () =>
      new Response(
        `<rss version="2.0"><channel><title>B</title><item><title>Same title</title><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate><description>${content}</description></item></channel></rss>`
      )

    await sync({ 'https://bare.example.com/feed': bare('first draft') })

    const edited = await sync({
      'https://bare.example.com/feed': bare('fixed a typo'),
    })

    expect(edited.result).toMatchObject({ itemsNew: 0 })
    expect(await articlesOf(feedId)).toMatchObject([
      { excerpt: 'fixed a typo' },
    ])
  })

  test('the run reports feed health in its metrics', async () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 3_600_000

    await addFeed('https://rss.example.com/feed.xml')
    await addFeed('https://empty.example.com/feed')
    // Added days ago and failing ever since.
    await addFeed('https://gone.example.com/feed', threeDaysAgo)

    const { metrics } = await sync(
      {
        'https://rss.example.com/feed.xml': serve('rss.xml'),
        'https://empty.example.com/feed': () =>
          new Response(
            '<rss version="2.0"><channel><title>E</title></channel></rss>'
          ),
        'https://gone.example.com/feed': () =>
          new Response('', { status: 410 }),
      },
      {
        settings: {
          // The fixtures are from November 2026: anything since January
          // counts as recent, whenever this test runs.
          staleAfterMs: Date.now() - Date.UTC(2026, 0, 1),
        },
      }
    )

    expect(metrics.runs[0]?.health).toEqual({
      // rss.example.com: recent articles.
      healthy: 1,
      // empty.example.com: works, but has never published anything.
      stale: 1,
      // gone.example.com: no success in the 2 days since it was added.
      failing: 1,
    })
  })
})
