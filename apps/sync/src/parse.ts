import { escapeUTF8 } from 'entities'
import { parseFeed as parseAnyFeed } from 'feedsmith'

/** One item, the same whatever format the feed used. Dates are raw strings. */
export interface ParsedItem {
  /** guid (RSS), id (Atom, JSON Feed); null when the feed gives none. */
  readonly id: string | null
  /** Absolute URL of the article, when the feed gives one. */
  readonly link: string | null
  /** Plain text. */
  readonly title: string | null
  readonly author: string | null
  /** Untrusted HTML; cleaned before it is stored. */
  readonly html: string | null
  readonly published: string | null
}

export interface ParsedFeed {
  readonly format: 'rss' | 'atom' | 'rdf' | 'json'
  readonly title: string | null
  readonly siteUrl: string | null
  readonly items: readonly ParsedItem[]
}

/** Not RSS, Atom, RDF or JSON Feed, or too broken to read. */
export class InvalidFeed extends Error {}

/** Parse any supported feed format into one shape. */
export const parseFeed = (body: string, feedUrl: string): ParsedFeed => {
  const parsed = parseOrThrow(body)
  const resolve = (link: string | undefined) => absoluteUrl(link, feedUrl)

  switch (parsed.format) {
    case 'rss': {
      const { feed } = parsed

      return {
        format: 'rss',
        title: present(feed.title),
        siteUrl: resolve(feed.link),
        items: (feed.items ?? []).map((item) => ({
          id: present(item.guid?.value),
          link: resolve(item.link),
          title: present(item.title),
          author: present(item.authors?.[0]?.name ?? item.dc?.creators?.[0]),
          html: present(item.content?.encoded ?? item.description),
          published: present(item.pubDate ?? item.dc?.dates?.[0]),
        })),
      }
    }

    case 'rdf': {
      const { feed } = parsed

      return {
        format: 'rdf',
        title: present(feed.title),
        siteUrl: resolve(feed.link),
        items: (feed.items ?? []).map((item) => ({
          id: present(item.rdf?.about),
          link: resolve(item.link),
          title: present(item.title),
          author: present(item.dc?.creators?.[0]),
          html: present(item.content?.encoded ?? item.description),
          published: present(item.dc?.dates?.[0]),
        })),
      }
    }

    case 'atom': {
      const { feed } = parsed

      return {
        format: 'atom',
        title: present(feed.title?.value),
        siteUrl: resolve(alternateLink(feed.links)),
        items: (feed.entries ?? []).map((entry) => ({
          id: present(entry.id),
          link: resolve(alternateLink(entry.links)),
          title: present(entry.title?.value),
          author: present(entry.authors?.[0]?.name),
          html: atomHtml(entry.content ?? entry.summary),
          published: present(entry.published ?? entry.updated),
        })),
      }
    }

    case 'json': {
      const { feed } = parsed

      return {
        format: 'json',
        title: present(feed.title),
        siteUrl: resolve(feed.home_page_url),
        items: (feed.items ?? []).map((item) => ({
          id: present(item.id),
          link: resolve(item.url ?? item.external_url),
          title: present(item.title),
          author: present(item.authors?.[0]?.name),
          html: jsonHtml(item),
          published: present(item.date_published ?? item.date_modified),
        })),
      }
    }
  }
}

const parseOrThrow = (body: string) => {
  try {
    return parseAnyFeed(body)
  } catch (cause) {
    throw new InvalidFeed('not a valid feed', { cause })
  }
}

/** A trimmed string, or null for missing or blank values. */
const present = (value: string | undefined): string | null => {
  const trimmed = value?.trim()

  if (trimmed === undefined || trimmed === '') return null

  return trimmed
}

const absoluteUrl = (link: string | undefined, base: string): string | null => {
  const value = present(link)

  if (value === null) return null

  try {
    const url = new URL(value, base)

    // Feed links end up as hrefs; only web links are kept.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    return url.href
  } catch {
    return null
  }
}

/** Atom's page link: rel="alternate", or a link with no rel. */
const alternateLink = (
  links: ReadonlyArray<{ readonly href?: string; readonly rel?: string }> = []
): string | undefined => {
  const alternate = links.find(
    (link) => link.rel === undefined || link.rel === 'alternate'
  )

  return alternate?.href
}

/** Atom text constructs: `text` content is not markup, so escape it. */
const atomHtml = (
  content: { readonly value?: string; readonly type?: string } | undefined
): string | null => {
  const value = present(content?.value)

  if (value === null) return null

  if (content?.type === 'html' || content?.type === 'xhtml') return value

  return textAsHtml(value)
}

const jsonHtml = (item: {
  readonly content_html?: string
  readonly content_text?: string
  readonly summary?: string
}): string | null => {
  const html = present(item.content_html)

  if (html !== null) return html

  const text = present(item.content_text ?? item.summary)

  if (text === null) return null

  return textAsHtml(text)
}

const textAsHtml = (text: string): string => `<p>${escapeUTF8(text)}</p>`
