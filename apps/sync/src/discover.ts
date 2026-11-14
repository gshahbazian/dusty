import { DomUtils, parseDocument } from 'htmlparser2'

import { webUrl } from '#/urls'

export { normalizeFeedUrl, webUrl } from '#/urls'

const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/json',
  'application/rdf+xml',
])

/**
 * The feed a web page advertises with `<link rel="alternate" type="...">`,
 * as an absolute http(s) URL, or null if it advertises none. The first one
 * listed wins, which is how browsers and readers usually treat it.
 */
export const findAdvertisedFeed = (
  html: string,
  pageUrl: string
): string | null => {
  const document = parseDocument(html)
  const links = DomUtils.getElementsByTagName('link', document.children)

  for (const link of links) {
    const rel = (link.attribs['rel'] ?? '').toLowerCase().split(/\s+/)

    const type = (link.attribs['type'] ?? '')
      .toLowerCase()
      .split(';')[0]
      ?.trim()

    const href = link.attribs['href']

    if (!rel.includes('alternate') || type === undefined) continue

    if (!FEED_TYPES.has(type) || href === undefined) continue

    const url = webUrl(href, pageUrl)

    if (url !== null) return url
  }

  return null
}
