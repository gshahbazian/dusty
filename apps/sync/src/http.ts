import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import type { FeedToSync, FetchErrorType } from '@dusty/db'

/**
 * How the sync service reaches the web. Deployed it is the platform's
 * `fetch`; tests swap in a function that serves fixtures.
 */
export class HttpFetch extends Context.Service<
  HttpFetch,
  { readonly fetch: (request: Request) => Promise<Response> }
>()('dusty/HttpFetch') {}

export const HttpFetchLive = Layer.succeed(
  HttpFetch,
  HttpFetch.of({ fetch: (request) => fetch(request) })
)

/** A fetch that failed, with the error in plain words for the health view. */
export class FeedFetchError extends Data.TaggedError('FeedFetchError')<{
  readonly errorType: FetchErrorType
  readonly message: string
  readonly httpStatus: number | null
  /** Technical detail for logs (never shown as the plain-words error). */
  readonly detail?: string
}> {}

export type FetchResult =
  | { readonly kind: 'not_modified' }
  | {
      readonly kind: 'changed'
      readonly httpStatus: number
      readonly body: string
      readonly etag: string | null
      readonly lastModified: string | null
    }

/** What a fetch needs: the URL, and what the last fetch said about it. */
export type FetchTarget = Pick<FeedToSync, 'url' | 'etag' | 'lastModified'>

export interface FetchSettings {
  readonly userAgent: string
  readonly timeoutMs: number
  readonly maxBytes: number
}

const ACCEPT = [
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/xml;q=0.9',
  'text/xml;q=0.9',
  '*/*;q=0.8',
].join(', ')

/**
 * Fetch a feed politely: a clear user agent, and `If-None-Match` /
 * `If-Modified-Since` so an unchanged feed answers 304 with no body. The
 * whole fetch, body included, has a time limit and a size cap.
 */
export const fetchFeed = Effect.fn('feed.fetch')(function* (
  feed: FetchTarget,
  settings: FetchSettings
) {
  const http = yield* HttpFetch

  yield* Effect.annotateCurrentSpan('url.full', feed.url)

  const result = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await http.fetch(
        new Request(feed.url, {
          headers: requestHeaders(feed, settings),
          redirect: 'follow',
          signal,
        })
      )

      return readResponse(response, settings.maxBytes)
    },
    catch: toFetchError,
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(settings.timeoutMs),
      orElse: () =>
        Effect.fail(
          new FeedFetchError({
            errorType: 'timeout',
            message: `timed out after ${Math.round(settings.timeoutMs / 1000)} seconds`,
            httpStatus: null,
          })
        ),
    })
  )

  yield* Effect.annotateCurrentSpan(
    'http.response.status_code',
    result.kind === 'not_modified' ? 304 : result.httpStatus
  )

  return result
})

const requestHeaders = (
  feed: FetchTarget,
  settings: FetchSettings
): Headers => {
  const headers = new Headers({
    'user-agent': settings.userAgent,
    accept: ACCEPT,
  })

  if (feed.etag !== null) headers.set('if-none-match', feed.etag)

  if (feed.lastModified !== null) {
    headers.set('if-modified-since', feed.lastModified)
  }

  return headers
}

/** A thrown fetch error: the network failed, or our own typed failure. */
const toFetchError = (cause: unknown): FeedFetchError => {
  if (cause instanceof FeedFetchError) return cause

  return new FeedFetchError({
    errorType: 'network',
    message: 'could not connect',
    httpStatus: null,
    detail: String(cause),
  })
}

/**
 * Turn a response into a result. A bad status or an oversized body throws a
 * `FeedFetchError`, which `toFetchError` passes through as the failure.
 */
const readResponse = async (
  response: Response,
  maxBytes: number
): Promise<FetchResult> => {
  if (response.status === 304) {
    await response.body?.cancel()

    return { kind: 'not_modified' }
  }

  if (!response.ok) {
    await response.body?.cancel()

    throw new FeedFetchError({
      errorType: 'http',
      message: describeStatus(response.status),
      httpStatus: response.status,
    })
  }

  const bytes = await readCapped(response, maxBytes)

  if (bytes === null) {
    throw new FeedFetchError({
      errorType: 'too_large',
      message: `larger than ${describeBytes(maxBytes)}`,
      httpStatus: response.status,
    })
  }

  return {
    kind: 'changed',
    httpStatus: response.status,
    body: decode(bytes, response.headers.get('content-type')),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
}

/** The body, or null as soon as it passes `maxBytes`. */
const readCapped = async (
  response: Response,
  maxBytes: number
): Promise<Uint8Array | null> => {
  const declared = Number(response.headers.get('content-length'))

  if (declared > maxBytes) {
    await response.body?.cancel()

    return null
  }

  if (response.body === null) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) break

    total += value.byteLength

    if (total > maxBytes) {
      await reader.cancel()

      return null
    }

    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

/**
 * Decode the body with the charset from the Content-Type header, else the
 * XML declaration, else UTF-8.
 */
const decode = (bytes: Uint8Array, contentType: string | null): string => {
  const charset = (
    headerCharset(contentType) ??
    xmlCharset(bytes) ??
    'utf-8'
  ).toLowerCase()

  // Workers' TextDecoder only knows UTF-8, and these are common in old feeds.
  if (WINDOWS_1252_LABELS.has(charset)) return decodeWindows1252(bytes)

  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Labels browsers decode as Windows-1252 (the WHATWG Encoding standard). */
const WINDOWS_1252_LABELS = new Set([
  'iso-8859-1',
  'iso8859-1',
  'latin1',
  'l1',
  'us-ascii',
  'ascii',
  'windows-1252',
  'cp1252',
])

/** Windows-1252's characters for bytes 0x80 to 0x9f; the rest match Latin-1. */
const WINDOWS_1252_HIGH = [
  0x20_ac, 0x81, 0x20_1a, 0x01_92, 0x20_1e, 0x20_26, 0x20_20, 0x20_21, 0x02_c6,
  0x20_30, 0x01_60, 0x20_39, 0x01_52, 0x8d, 0x01_7d, 0x8f, 0x90, 0x20_18,
  0x20_19, 0x20_1c, 0x20_1d, 0x20_22, 0x20_13, 0x20_14, 0x02_dc, 0x21_22,
  0x01_61, 0x20_3a, 0x01_53, 0x9d, 0x01_7e, 0x01_78,
]

const decodeWindows1252 = (bytes: Uint8Array): string => {
  let text = ''

  for (const byte of bytes) {
    const high =
      byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH[byte - 0x80] : undefined

    text += String.fromCodePoint(high ?? byte)
  }

  return text
}

const headerCharset = (contentType: string | null): string | null =>
  /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1] ?? null

const xmlCharset = (bytes: Uint8Array): string | null => {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200))

  return /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? null
}

const describeBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`

  return `${Math.round(bytes / 1024)} KB`
}

const STATUS_WORDS = new Map([
  [400, 'bad request'],
  [401, 'needs a login'],
  [403, 'forbidden'],
  [404, 'not found'],
  [410, 'gone'],
  [429, 'too many requests'],
  [500, 'server error'],
  [502, 'bad gateway'],
  [503, 'service unavailable'],
  [504, 'gateway timeout'],
])

/** e.g. "404 not found", for the health view. */
const describeStatus = (status: number): string => {
  const words = STATUS_WORDS.get(status)

  if (words === undefined) return `HTTP ${status}`

  return `${status} ${words}`
}
