import { describe, expect, test } from 'vitest'

import type { ArticleRow, FeedCount } from '@dusty/db'

import {
  adjustedCounts,
  articles,
  idsAbove,
  isRead,
  readWhenLoaded,
  withRead,
} from '#/components/unread/list-state'
import { parseArticleSearch, parseFeedSearch } from '#/lib/article-search'
import { contentSecurityPolicy, createNonce } from '#/server/security-headers'

const row = (id: number, feedId: number): ArticleRow => ({
  id,
  feedId,
  feedTitle: `Feed ${feedId}`,
  title: `Article ${id}`,
  url: null,
  excerpt: null,
  publishedAt: id,
  readAt: null,
})

describe('mark all above', () => {
  const rows = [row(10, 1), row(11, 2), row(12, 1), row(13, 1)]

  test('names exactly the rows above the chosen one, in order', () => {
    expect(idsAbove(rows, 12)).toEqual([10, 11])
  })

  test('nothing above the first row, or a row not in the list', () => {
    expect(idsAbove(rows, 10)).toEqual([])
    expect(idsAbove(rows, 99)).toEqual([])
  })
})

describe('read state and counts', () => {
  const rows = [row(10, 1), row(11, 2), row(12, 1)]

  const counts: FeedCount[] = [
    { feedId: 1, title: 'Feed 1', unread: 5 },
    { feedId: 2, title: 'Feed 2', unread: 1 },
  ]

  test('counts drop by the rows marked read since loading, per feed', () => {
    const overrides = withRead(new Map(), [10, 12], true)

    expect(adjustedCounts(counts, rows, overrides)).toEqual({
      total: 4,
      byFeed: [
        { feedId: 1, title: 'Feed 1', unread: 3 },
        { feedId: 2, title: 'Feed 2', unread: 1 },
      ],
    })
  })

  test('marking unread again restores the count', () => {
    const read = withRead(new Map(), [10, 11], true)
    const back = withRead(read, [11], false)

    expect(isRead(back, 10)).toBe(true)
    expect(isRead(back, 11)).toBe(false)
    expect(adjustedCounts(counts, rows, back).total).toBe(5)
  })

  test('a row loaded read (a feed\'s "all" list) counts when marked unread', () => {
    const loaded = [{ ...row(20, 1), readAt: 5 }, row(21, 1)]
    const loadedRead = readWhenLoaded(loaded)

    expect(isRead(new Map(), 20, loadedRead)).toBe(true)
    expect(isRead(new Map(), 21, loadedRead)).toBe(false)

    // Nothing changed yet: the counts are as loaded.
    expect(adjustedCounts(counts, loaded, new Map()).total).toBe(6)

    // Marking the read one unread adds one; marking it read again, back.
    const unread = withRead(new Map(), [20], false)

    expect(isRead(unread, 20, loadedRead)).toBe(false)
    expect(adjustedCounts(counts, loaded, unread).total).toBe(7)
    expect(
      adjustedCounts(counts, loaded, withRead(unread, [20], true)).total
    ).toBe(6)
  })

  test('says "1 article" and "3 articles"', () => {
    expect(articles(1)).toBe('1 article')
    expect(articles(3)).toBe('3 articles')
  })
})

describe('?article=', () => {
  test.each([
    [{ article: 12 }, 12],
    [{ article: 'abc' }, undefined],
    [{ article: -1 }, undefined],
    [{ article: 1.5 }, undefined],
    [{}, undefined],
  ])('%o reads as %o', (search, article) => {
    expect(parseArticleSearch(search)).toEqual({ article })
  })
})

describe("a feed's ?show=", () => {
  test.each([
    [{ show: 'all' }, 'all'],
    [{ show: 'unread' }, undefined],
    [{ show: 'bogus' }, undefined],
    [{}, undefined],
  ])('%o reads as %o', (search, show) => {
    expect(parseFeedSearch({ ...search, article: 3 })).toEqual({
      article: 3,
      show,
    })
  })
})

describe('Content Security Policy', () => {
  const policy = contentSecurityPolicy({ nonce: 'abc123', dev: false })

  const directive = (name: string) =>
    policy.split('; ').find((part) => part.startsWith(`${name} `))

  test('only scripts carrying the nonce run, and the chunks they load', () => {
    expect(directive('script-src')).toBe(
      "script-src 'nonce-abc123' 'strict-dynamic'"
    )
    expect(policy).not.toContain('unsafe-inline')
    expect(policy).not.toContain('unsafe-eval')
  })

  test('everything else is off unless the app needs it', () => {
    expect(directive('default-src')).toBe("default-src 'none'")
    expect(directive('img-src')).toBe("img-src 'self' https:")
    expect(directive('frame-src')).toBe("frame-src 'none'")
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('base-uri')).toBe("base-uri 'none'")
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  test("dev adds only what Vite's dev server needs", () => {
    const dev = contentSecurityPolicy({ nonce: 'abc123', dev: true })

    expect(dev).toContain("style-src 'self' 'unsafe-inline'")
    expect(dev).toContain("connect-src 'self' ws:")
    expect(dev).toContain("script-src 'nonce-abc123' 'strict-dynamic'")
  })

  test('nonces are fresh each time', () => {
    expect(createNonce()).not.toBe(createNonce())
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
})
