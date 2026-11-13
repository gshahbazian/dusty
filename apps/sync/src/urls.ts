// Pure URL helpers, shared with the web app (`@dusty/sync/urls`), so the
// OPML preview there can match entries to subscriptions the same way.

/** An absolute http(s) URL, or null. */
export const webUrl = (raw: string, base?: string): string | null => {
  try {
    const url = new URL(raw.trim(), base)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    return url.href
  } catch {
    return null
  }
}

/**
 * What the owner typed or pasted, as a feed URL: trimmed, `https://` added
 * when no scheme is given, and only http(s) accepted.
 */
export const normalizeFeedUrl = (input: string): string | null => {
  const trimmed = input.trim()

  if (trimmed === '') return null

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)

  return webUrl(hasScheme ? trimmed : `https://${trimmed}`)
}
