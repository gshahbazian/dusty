import type { StoredItem } from '@dusty/db'

import { cleanHtml, excerptOf, toPlainText } from './clean.ts'
import type { ParsedItem } from './parse.ts'

const DAY = 24 * 60 * 60_000
const MAX_TITLE_LENGTH = 500

/**
 * Article HTML bigger than this (UTF-8 bytes, after cleaning) is not stored;
 * the article keeps its title, excerpt and link to the original. It keeps
 * every write well under D1's ~2 MB limit on a single value.
 */
export const MAX_CONTENT_BYTES = 400_000

const encoder = new TextEncoder()

/**
 * Turn parsed feed items into rows to store: a stable key per item, cleaned
 * HTML, plain-text title and excerpt, a trusted date and a content hash. An
 * item listed twice in one feed is kept once (the first time it appears).
 */
export const toStoredItems = async (
  items: readonly ParsedItem[],
  now: number
): Promise<StoredItem[]> => {
  const stored = await Promise.all(items.map((item) => toStoredItem(item, now)))
  const seen = new Set<string>()

  return stored.filter((item) => {
    if (seen.has(item.itemKey)) return false

    seen.add(item.itemKey)

    return true
  })
}

const toStoredItem = async (
  item: ParsedItem,
  now: number
): Promise<StoredItem> => {
  const cleaned = cleanedContent(item)
  const contentHtml = storableContent(cleaned)
  const title = plainTitle(item.title)
  const publishedAt = trustedDate(item.published, now)

  // The fallback leaves out the content, so a publisher's edit to an item
  // with no id or link does not make it a new article. Content counts only
  // when there is no title or date to go on.
  const itemKey =
    item.id ??
    item.link ??
    `hash:${await sha256(fallbackKeyParts(title, item.published, cleaned))}`

  const contentHash = await sha256([item.link, title, item.author, cleaned])

  return {
    itemKey,
    url: item.link,
    title,
    author: item.author,
    contentHtml,
    // From the full content, so an article too big to store still has one.
    excerpt: cleaned === null ? null : excerptOf(cleaned),
    publishedAt,
    contentHash,
  }
}

const fallbackKeyParts = (
  title: string | null,
  published: string | null,
  contentHtml: string | null
): ReadonlyArray<string | null> => {
  if (title === null && published === null) return [contentHtml]

  return [title, published]
}

/** The cleaned HTML, unless it is too big to store. */
const storableContent = (html: string | null): string | null => {
  if (html === null) return null

  if (encoder.encode(html).byteLength > MAX_CONTENT_BYTES) return null

  return html
}

const cleanedContent = (item: ParsedItem): string | null => {
  if (item.html === null) return null

  const cleaned = cleanHtml(item.html, item.link)

  if (cleaned === '') return null

  return cleaned
}

/** A title as plain text: tags stripped, entities decoded, length capped. */
export const plainTitle = (title: string | null): string | null => {
  if (title === null) return null

  const text = toPlainText(title).slice(0, MAX_TITLE_LENGTH)

  if (text === '') return null

  return text
}

/**
 * The item's date, if it is believable. Missing, unreadable, or more than a
 * day in the future gives null, and the article is dated when first seen, so
 * a bad date cannot pin it to the top of a list.
 */
const trustedDate = (raw: string | null, now: number): number | null => {
  if (raw === null) return null

  const parsed = Date.parse(raw)

  if (Number.isNaN(parsed)) return null

  if (parsed > now + DAY) return null

  return parsed
}

const sha256 = async (parts: ReadonlyArray<string | null>): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(parts))
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}
