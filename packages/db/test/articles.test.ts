import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  createDb,
  getArticle,
  insertFeed,
  listArticles,
  markRead,
  markUnread,
  recordFeedChanged,
  renameFeed,
  schema,
  undoMarkRead,
  unreadCounts,
  type Db,
  type StoredItem,
} from '../src/index.ts'
import { createTestD1 } from '../src/testing.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const T0 = Date.UTC(2026, 10, 20)

/** A snapshot later than anything stored, for tests not about the snapshot. */
const ALL = Number.MAX_SAFE_INTEGER

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

const addFeed = async (url: string) => {
  const id = await insertFeed(db, { url, customTitle: null, now: T0 })

  if (id === null) throw new Error(`${url} already subscribed`)

  return id
}

const item = (key: string, publishedAt: number): StoredItem => ({
  itemKey: key,
  url: `https://example.com/${key}`,
  title: key,
  author: null,
  contentHtml: `<p>${key}</p>`,
  excerpt: key,
  publishedAt,
  contentHash: `hash-${key}`,
})

/** A sync storing these items (by key, published at the given times) now. */
const sync = (
  feedId: number,
  items: ReadonlyArray<readonly [string, number]>,
  now: number
) =>
  recordFeedChanged(db, feedId, {
    items: items.map(([key, publishedAt]) => item(key, publishedAt)),
    title: `Feed ${feedId}`,
    siteUrl: null,
    etag: null,
    lastModified: null,
    httpStatus: 200,
    now,
  })

const keysOf = (rows: ReadonlyArray<{ readonly title: string | null }>) =>
  rows.map((row) => row.title)

const idsOf = async (keys: readonly string[]) => {
  const rows = await db
    .select({ id: schema.articles.id, key: schema.articles.itemKey })
    .from(schema.articles)
    .where(inArray(schema.articles.itemKey, [...keys]))

  return keys.map((key) => {
    const row = rows.find((candidate) => candidate.key === key)

    if (row === undefined) throw new Error(`no article ${key}`)

    return row.id
  })
}

const readState = async () => {
  const rows = await db
    .select({ key: schema.articles.itemKey, readAt: schema.articles.readAt })
    .from(schema.articles)
    .orderBy(schema.articles.itemKey)

  return Object.fromEntries(rows.map((row) => [row.key, row.readAt !== null]))
}

describe('lists', () => {
  test('global is oldest first, a feed is newest first, ties broken by id', async () => {
    const a = await addFeed('https://a.test/feed')
    const b = await addFeed('https://b.test/feed')

    await sync(
      a,
      [
        ['a-new', T0 + 2 * HOUR],
        ['a-old', T0],
      ],
      T0
    )
    await sync(
      b,
      [
        ['b-mid', T0 + HOUR],
        ['b-tie', T0 + HOUR],
      ],
      T0
    )

    expect(
      keysOf(await listArticles(db, { feedId: null, seenBy: ALL }))
    ).toEqual(['a-old', 'b-mid', 'b-tie', 'a-new'])
    expect(keysOf(await listArticles(db, { feedId: b, seenBy: ALL }))).toEqual([
      'b-tie',
      'b-mid',
    ])
  })

  test('rows carry the display title of their feed, never the HTML', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(a, [['x', T0]], T0)
    await renameFeed(db, a, 'My feed')

    const [row] = await listArticles(db, { feedId: null, seenBy: ALL })

    expect(row).toEqual({
      id: expect.any(Number),
      feedId: a,
      feedTitle: 'My feed',
      title: 'x',
      url: 'https://example.com/x',
      excerpt: 'x',
      publishedAt: T0,
      readAt: null,
    })
  })

  test("a feed's list can show read articles too, with when they were read", async () => {
    const a = await addFeed('https://a.test/feed')
    const b = await addFeed('https://b.test/feed')

    await sync(
      a,
      [
        ['old', T0],
        ['new', T0 + HOUR],
      ],
      T0
    )
    await sync(b, [['other', T0]], T0)
    await markRead(db, {
      ids: await idsOf(['old', 'other']),
      snapshotAt: null,
      actionId: 'x',
      now: T0 + 5,
    })

    // Unread (the default): the read one is gone.
    expect(keysOf(await listArticles(db, { feedId: a, seenBy: ALL }))).toEqual([
      'new',
    ])

    // All: both, newest first, read ones saying when; only this feed.
    const all = await listArticles(db, { feedId: a, seenBy: ALL, show: 'all' })

    expect(all.map((row) => [row.title, row.readAt])).toEqual([
      ['new', null],
      ['old', T0 + 5],
    ])

    // The global list is always unread only.
    expect(
      keysOf(await listArticles(db, { feedId: null, seenBy: ALL, show: 'all' }))
    ).toEqual(['new'])
  })

  test('a list stops at its limit, in order; counts still count everything', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(
      a,
      [
        ['1', T0],
        ['2', T0 + 1],
        ['3', T0 + 2],
      ],
      T0
    )

    expect(
      keysOf(await listArticles(db, { feedId: null, seenBy: ALL, limit: 2 }))
    ).toEqual(['1', '2'])
    expect(
      keysOf(await listArticles(db, { feedId: a, seenBy: ALL, limit: 2 }))
    ).toEqual(['3', '2'])
    expect(await unreadCounts(db, { seenBy: ALL })).toEqual([
      { feedId: a, title: 'Feed 1', unread: 3 },
    ])
  })

  test('a list and its counts leave out what a sync stored after the snapshot', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(a, [['seen', T0]], T0)

    // The list's snapshot is taken; then a sync lands before its queries
    // run, storing an article that sorts first.
    const snapshotAt = T0 + MINUTE

    await sync(
      a,
      [
        ['seen', T0],
        ['late', T0 - HOUR],
      ],
      snapshotAt + 1
    )

    // Only what "mark all above" would act on is listed and counted.
    expect(
      keysOf(await listArticles(db, { feedId: null, seenBy: snapshotAt }))
    ).toEqual(['seen'])
    expect(
      keysOf(await listArticles(db, { feedId: a, seenBy: snapshotAt }))
    ).toEqual(['seen'])
    expect(await unreadCounts(db, { seenBy: snapshotAt })).toEqual([
      { feedId: a, title: 'Feed 1', unread: 1 },
    ])

    // The next snapshot has it.
    expect(
      keysOf(await listArticles(db, { feedId: null, seenBy: snapshotAt + 1 }))
    ).toEqual(['late', 'seen'])
  })

  test('unread counts match the lists, zeros included', async () => {
    const a = await addFeed('https://a.test/feed')
    const b = await addFeed('https://b.test/feed')

    await sync(
      a,
      [
        ['a1', T0],
        ['a2', T0],
      ],
      T0
    )
    await markRead(db, {
      ids: await idsOf(['a1']),
      snapshotAt: null,
      actionId: 'x',
      now: T0,
    })

    expect(await unreadCounts(db, { seenBy: ALL })).toEqual([
      { feedId: a, title: 'Feed 1', unread: 1 },
      { feedId: b, title: 'https://b.test/feed', unread: 0 },
    ])
  })

  test('an article opens with its HTML', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(a, [['x', T0]], T0)

    const [id] = await idsOf(['x'])

    expect(await getArticle(db, id ?? -1)).toMatchObject({
      title: 'x',
      html: '<p>x</p>',
      feedTitle: 'Feed 1',
      readAt: null,
    })
    expect(await getArticle(db, 9999)).toBeNull()
  })
})

describe('mark all above as read', () => {
  test('marks exactly the listed rows, in one action', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(
      a,
      [
        ['1', T0],
        ['2', T0 + 1],
        ['3', T0 + 2],
        ['4', T0 + 3],
      ],
      T0
    )

    const changed = await markRead(db, {
      ids: await idsOf(['1', '2']),
      snapshotAt: T0,
      actionId: 'action-1',
      now: T0 + HOUR,
    })

    expect(changed).toEqual(await idsOf(['1', '2']))
    expect(await readState()).toEqual({
      '1': true,
      '2': true,
      '3': false,
      '4': false,
    })
  })

  test('a sync landing between loading the list and the action is never touched', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(
      a,
      [
        ['seen-1', T0 + 10],
        ['seen-2', T0 + 20],
      ],
      T0
    )

    // The owner loads the list: this is what is on screen.
    const loadedAt = T0 + MINUTE
    const onScreen = await listArticles(db, { feedId: null, seenBy: ALL })

    // A sync lands before they act. One new article is published *earlier*
    // than everything on screen, so it would sort above the chosen row if
    // the list were reloaded.
    await sync(
      a,
      [
        ['seen-1', T0 + 10],
        ['seen-2', T0 + 20],
        ['arrived-late', T0],
      ],
      loadedAt + MINUTE
    )

    // "Mark all above" on seen-2: exactly the rows above it on screen.
    const above = onScreen.slice(0, 1).map((row) => row.id)

    await markRead(db, {
      ids: above,
      snapshotAt: loadedAt,
      actionId: 'action-1',
      now: loadedAt + 2 * MINUTE,
    })

    expect(await readState()).toEqual({
      'arrived-late': false,
      'seen-1': true,
      'seen-2': false,
    })
  })

  test('a late article is not marked even if its id is sent (the snapshot guard)', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(a, [['seen', T0]], T0)
    await sync(
      a,
      [
        ['seen', T0],
        ['late', T0],
      ],
      T0 + 2 * MINUTE
    )

    const changed = await markRead(db, {
      ids: await idsOf(['seen', 'late']),
      snapshotAt: T0 + MINUTE,
      actionId: 'action-1',
      now: T0 + 3 * MINUTE,
    })

    expect(changed).toEqual(await idsOf(['seen']))
    expect(await readState()).toEqual({ late: false, seen: true })
  })

  test('rows already read stay read and are not part of the action', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(
      a,
      [
        ['1', T0],
        ['2', T0 + 1],
        ['3', T0 + 2],
      ],
      T0
    )

    await markRead(db, {
      ids: await idsOf(['2']),
      snapshotAt: null,
      actionId: 'earlier',
      now: T0 + MINUTE,
    })

    const changed = await markRead(db, {
      ids: await idsOf(['1', '2', '3']),
      snapshotAt: T0,
      actionId: 'above',
      now: T0 + 2 * MINUTE,
    })

    expect(changed).toEqual(await idsOf(['1', '3']))

    // Undoing the later action leaves the earlier one alone.
    await undoMarkRead(db, 'above')

    expect(await readState()).toEqual({ '1': false, '2': true, '3': false })
  })

  test('takes far more ids than D1 allows parameters', async () => {
    const a = await addFeed('https://a.test/feed')

    const items = Array.from(
      { length: 500 },
      (_, i) => [`item-${String(i).padStart(3, '0')}`, T0 + i] as const
    )

    await sync(a, items, T0)

    const ids = (await listArticles(db, { feedId: null, seenBy: ALL })).map(
      (row) => row.id
    )

    const changed = await markRead(db, {
      ids,
      snapshotAt: T0,
      actionId: 'big',
      now: T0 + HOUR,
    })

    expect(changed).toHaveLength(500)
  })
})

describe('undo and mark unread', () => {
  test('undo restores exactly the rows its action changed', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(
      a,
      [
        ['1', T0],
        ['2', T0 + 1],
        ['3', T0 + 2],
      ],
      T0
    )

    const changed = await markRead(db, {
      ids: await idsOf(['1', '2']),
      snapshotAt: T0,
      actionId: 'action-1',
      now: T0 + MINUTE,
    })

    expect(await undoMarkRead(db, 'action-1')).toEqual(changed)
    expect(await readState()).toEqual({ '1': false, '2': false, '3': false })

    // A second undo has nothing left to do.
    expect(await undoMarkRead(db, 'action-1')).toEqual([])
  })

  test('a row marked unread, then read by a later action, is left alone by the first undo', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(
      a,
      [
        ['1', T0],
        ['2', T0 + 1],
      ],
      T0
    )

    const [one] = await idsOf(['1'])

    await markRead(db, {
      ids: await idsOf(['1', '2']),
      snapshotAt: T0,
      actionId: 'first',
      now: T0 + MINUTE,
    })
    await markUnread(db, one ?? -1)
    await markRead(db, {
      ids: [one ?? -1],
      snapshotAt: null,
      actionId: 'second',
      now: T0 + 2 * MINUTE,
    })

    expect(await undoMarkRead(db, 'first')).toEqual(await idsOf(['2']))
    expect(await readState()).toEqual({ '1': true, '2': false })
  })

  test('mark unread says whether anything changed', async () => {
    const a = await addFeed('https://a.test/feed')

    await sync(a, [['1', T0]], T0)

    const [one] = await idsOf(['1'])

    expect(await markUnread(db, one ?? -1)).toBe(false)

    await db
      .update(schema.articles)
      .set({ readAt: T0, readActionId: 'x' })
      .where(eq(schema.articles.id, one ?? -1))

    expect(await markUnread(db, one ?? -1)).toBe(true)
  })
})
