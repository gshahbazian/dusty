import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { toStoredItems } from '#/items'
import { parseFeed } from '#/parse'

/**
 * Saved copies of a few real personal blogs (fixtures/real, refreshed with
 * `.agents/skills/local-dev/scripts/save-real-feeds.sh`), run through what a
 * sync does with a feed: parse it, then clean and key every article.
 */
const DIR = join(import.meta.dirname, 'fixtures/real')

const sources = readFileSync(join(DIR, 'sources.tsv'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.split('\t'))

/** A fixed "now", after every saved article was published. */
const NOW = Date.UTC(2027, 0, 1)

/** Anything that could run, load a frame or style the page. */
const UNSAFE = [
  /<script/i,
  /<iframe/i,
  /<style/i,
  /<object/i,
  /<embed/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
]

/**
 * The targets of real links and images (in tags: an `href="…"` shown as
 * text, in a code sample, is escaped and isn't one).
 */
const targets = (html: string) =>
  [...html.matchAll(/<(?:a|img)\s[^>]*?(?:href|src)="([^"]*)"/g)].map(
    (match) => match[1]
  )

describe.each(sources)('%s', (file = '', url = '') => {
  const feed = parseFeed(readFileSync(join(DIR, file), 'utf8'), url)

  test('parses, with a title, a site and its articles', () => {
    expect(feed.title).toBeTruthy()
    expect(feed.siteUrl).toMatch(/^https?:\/\//)
    expect(feed.items.length).toBeGreaterThan(0)
    expect(feed.items.length).toBeLessThanOrEqual(10)
  })

  test('every article stores with a key, a date, and clean HTML', async () => {
    const items = await toStoredItems(feed.items, NOW)

    // Each saved article is kept (none collide on their key).
    expect(items).toHaveLength(feed.items.length)

    for (const item of items) {
      expect(item.itemKey).toBeTruthy()
      expect(item.title ?? item.excerpt).toBeTruthy()
      expect(item.publishedAt).toBeGreaterThan(Date.UTC(2000, 0, 1))
      expect(item.publishedAt).toBeLessThanOrEqual(NOW)

      const html = item.contentHtml ?? ''

      for (const pattern of UNSAFE) expect(html).not.toMatch(pattern)

      for (const target of targets(html)) {
        expect(target).toMatch(/^(https?:\/\/|mailto:)/)
      }
    }
  })
})
