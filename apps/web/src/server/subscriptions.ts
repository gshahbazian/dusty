import type { ImportEntry, Sync } from '@dusty/sync/contract'
import { normalizeFeedUrl } from '@dusty/sync/urls'
import { toRpcAsync } from '@alchemy.run/cloudflare/Bridge'
import { createServerFn } from '@tanstack/react-start'
import * as Schema from 'effect/Schema'
import { parseOpml } from 'feedsmith'

import { listSubscriptions, removeFeed, renameFeed, schema } from '@dusty/db'

import type { RequestContext } from './context.ts'
import { dbFor } from './db.ts'
import { ownerOnly } from './middleware.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Most OPML entries sent to the sync service in one call. */
export const IMPORT_BATCH_SIZE = 10

/** OPML files bigger than this are refused (a few thousand feeds fit). */
const MAX_OPML_CHARS = 2_000_000

/** The health thresholds the sync service uses, from the Worker's env. */
const healthOptions = (env: RequestContext['env']) => ({
  now: Date.now(),
  failingAfterMs: Number(env.FEED_FAILING_AFTER_HOURS) * HOUR,
  staleAfterMs: Number(env.FEED_STALE_AFTER_DAYS) * DAY,
})

/** Every subscription with its unread count and health. */
export const getSubscriptions = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(async ({ context }) => ({
    subscriptions: await listSubscriptions(
      dbFor(context.env),
      healthOptions(context.env)
    ),
    now: Date.now(),
  }))

/** Subscribe to a feed, or a page that advertises one, and sync it now. */
export const addSubscription = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({ url: Schema.String.check(Schema.isMaxLength(2048)) })
    )
  )
  .handler(({ context, data }) =>
    toRpcAsync<Sync>(context.env.SYNC).addFeed(data.url)
  )

/** Change a feed's display title; an empty title goes back to its own. */
export const renameSubscription = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({
        id: Schema.Int,
        title: Schema.String.check(Schema.isMaxLength(500)),
      })
    )
  )
  .handler(({ context, data }) =>
    renameFeed(dbFor(context.env), data.id, data.title)
  )

/** Unsubscribe; the feed's articles leave every list at once. */
export const removeSubscription = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(Schema.decodeUnknownSync(Schema.Struct({ id: Schema.Int })))
  .handler(({ context, data }) => removeFeed(dbFor(context.env), data.id))

export interface OpmlEntry extends ImportEntry {
  /** Already subscribed, or listed earlier in the same file. */
  readonly skip: 'subscribed' | 'duplicate' | null
}

export type OpmlPreview =
  | { readonly status: 'ok'; readonly entries: readonly OpmlEntry[] }
  | { readonly status: 'invalid'; readonly reason: string }

interface Outline {
  readonly xmlUrl?: string
  readonly title?: string
  readonly text?: string
  readonly outlines?: readonly Outline[]
}

/** Every feed an OPML outline tree lists, folders flattened. */
const feedsIn = (outlines: readonly Outline[]): ImportEntry[] =>
  outlines.flatMap((outline) => {
    const children = feedsIn(outline.outlines ?? [])

    if (outline.xmlUrl === undefined) return children

    const title = outline.title ?? outline.text ?? null

    return [{ url: outline.xmlUrl, title }, ...children]
  })

/** A typed preview, so the union does not widen to a plain object. */
const invalidOpml = (reason: string): OpmlPreview => ({
  status: 'invalid',
  reason,
})

/**
 * Read an OPML file: the feeds it lists, and which of them would be skipped
 * (already subscribed, or listed twice). Nothing is subscribed yet.
 */
export const previewOpml = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({
        opml: Schema.String.check(Schema.isMaxLength(MAX_OPML_CHARS)),
      })
    )
  )
  .handler(async ({ context, data }): Promise<OpmlPreview> => {
    const outlines = readOutlines(data.opml)

    if (outlines === null) return invalidOpml('not a valid OPML file')

    const listed = feedsIn(outlines)

    if (listed.length === 0) return invalidOpml('no feeds in this file')

    const subscribed = await dbFor(context.env)
      .select({ url: schema.feeds.url })
      .from(schema.feeds)

    const known = new Set(subscribed.map((feed) => feed.url))
    const seen = new Set<string>()

    const entries = listed.map((entry): OpmlEntry => {
      const url = normalizeFeedUrl(entry.url) ?? entry.url
      const skip = skipReason(url, known, seen)

      seen.add(url)

      return { url, title: entry.title, skip }
    })

    return { status: 'ok', entries }
  })

const readOutlines = (opml: string): readonly Outline[] | null => {
  try {
    return parseOpml(opml).body?.outlines ?? []
  } catch {
    return null
  }
}

const skipReason = (
  url: string,
  known: ReadonlySet<string>,
  seen: ReadonlySet<string>
): OpmlEntry['skip'] => {
  if (known.has(url)) return 'subscribed'

  if (seen.has(url)) return 'duplicate'

  return null
}

/** Import one batch of OPML entries (the page sends them a few at a time). */
export const importSubscriptions = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({
        entries: Schema.Array(
          Schema.Struct({
            url: Schema.String.check(Schema.isMaxLength(2048)),
            title: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
          })
        ).check(Schema.isMaxLength(IMPORT_BATCH_SIZE)),
      })
    )
  )
  .handler(({ context, data }) =>
    toRpcAsync<Sync>(context.env.SYNC).importFeeds(data.entries)
  )
