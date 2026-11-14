import { createServerFn } from '@tanstack/react-start'
import * as Schema from 'effect/Schema'

import { ownerOnly } from './middleware.ts'

/** A photo for the empty article pane (shown without a credit line). */
export interface Backdrop {
  readonly imageUrl: string
  readonly alt: string
  /** The photo's main colour, shown while it loads. */
  readonly color: string | null
}

/** What to ask Unsplash for, and how many at a time. */
const QUERY = 'calm landscape'
const BATCH = 30

/** The batch is kept this long, so Unsplash sees about one request an hour. */
const CACHE_SECONDS = 3600

/** A made-up URL naming the cached batch in the Worker's cache. */
const CACHE_KEY = 'https://dusty.cache/unsplash/calm-landscape'

const UNSPLASH_RANDOM = `https://api.unsplash.com/photos/random?${new URLSearchParams(
  {
    query: QUERY,
    count: String(BATCH),
    orientation: 'landscape',
    content_filter: 'high',
  }
).toString()}`

/**
 * Shown whenever the API gives nothing usable (no access key yet, a demo
 * app over its limit, Unsplash down): one fixed calm landscape.
 */
export const FALLBACK_BACKDROP: Backdrop = {
  imageUrl:
    'https://images.unsplash.com/photo-1421790500381-fc9b5996f343?w=1600&q=80&auto=format&fit=crop',
  alt: 'A river surrounded by trees',
  color: null,
}

const Photo = Schema.Struct({
  alt_description: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  urls: Schema.Struct({ regular: Schema.String }),
})

const decodePhotos = Schema.decodeUnknownSync(Schema.Array(Photo))

/** Only Unsplash's own https image addresses become image sources. */
const onUnsplash = (raw: string, host: string): string | null => {
  try {
    const url = new URL(raw)

    return url.protocol === 'https:' && url.hostname === host ? url.href : null
  } catch {
    return null
  }
}

const toBackdrop = (photo: typeof Photo.Type): Backdrop | null => {
  const imageUrl = onUnsplash(photo.urls.regular, 'images.unsplash.com')

  if (imageUrl === null) return null

  return {
    imageUrl,
    alt: photo.alt_description ?? 'A landscape photo',
    color: photo.color,
  }
}

/** The Unsplash response's text: from the Worker's cache, or fetched fresh. */
const batchText = async (accessKey: string): Promise<string> => {
  const cache = await caches.open('dusty-backdrop')
  const cached = await cache.match(CACHE_KEY)

  if (cached !== undefined) return cached.text()

  const response = await fetch(UNSPLASH_RANDOM, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  })

  if (!response.ok) throw new Error(`Unsplash answered ${response.status}`)

  const body = await response.text()

  await cache.put(
    CACHE_KEY,
    new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${CACHE_SECONDS}`,
      },
    })
  )

  return body
}

/**
 * The latest batch of photos, cached for an hour so the list changes
 * through the day. Anything not on Unsplash's own addresses is dropped.
 */
const photoBatch = async (accessKey: string): Promise<Backdrop[]> =>
  decodePhotos(JSON.parse(await batchText(accessKey))).flatMap(
    (photo) => toBackdrop(photo) ?? []
  )

/**
 * One calm landscape for the empty article pane, picked at random from
 * Unsplash's latest batch, or the fixed fallback when the API gives
 * nothing usable (no access key, an error, an empty batch).
 */
export const getBackdrop = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(async ({ context }): Promise<Backdrop> => {
    const accessKey = context.env.UNSPLASH_ACCESS_KEY

    if (accessKey === '') return FALLBACK_BACKDROP

    try {
      const photos = await photoBatch(accessKey)

      return (
        photos[Math.floor(Math.random() * photos.length)] ?? FALLBACK_BACKDROP
      )
    } catch (error) {
      console.warn('backdrop: using the fallback photo', error)

      return FALLBACK_BACKDROP
    }
  })
