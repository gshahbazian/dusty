import { createServerFn } from '@tanstack/react-start'
import * as Schema from 'effect/Schema'

import { getDailyBackdrop, saveDailyBackdrop } from '@dusty/db'

import { DAY_PATTERN, FALLBACK_BACKDROP, type Backdrop } from '#/lib/backdrop'
import { dbFor } from '#/server/db'
import { ownerOnly } from '#/server/middleware'

/** One calm landscape, picked by Unsplash. */
const UNSPLASH_RANDOM = `https://api.unsplash.com/photos/random?${new URLSearchParams(
  {
    query: 'calm landscape',
    orientation: 'landscape',
    content_filter: 'high',
  }
).toString()}`

const Photo = Schema.Struct({
  alt_description: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  urls: Schema.Struct({ regular: Schema.String }),
})

const decodePhoto = Schema.decodeUnknownSync(Photo)

/** Only Unsplash's own https image addresses become image sources. */
const onUnsplash = (raw: string, host: string): string | null => {
  try {
    const url = new URL(raw)

    return url.protocol === 'https:' && url.hostname === host ? url.href : null
  } catch {
    return null
  }
}

/** Ask Unsplash for a photo: the one API call a day. */
const fetchPhoto = async (accessKey: string): Promise<Backdrop> => {
  const response = await fetch(UNSPLASH_RANDOM, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  })

  if (!response.ok) throw new Error(`Unsplash answered ${response.status}`)

  const photo = decodePhoto(await response.json())
  const imageUrl = onUnsplash(photo.urls.regular, 'images.unsplash.com')

  if (imageUrl === null) throw new Error('Unsplash sent an unexpected address')

  return {
    imageUrl,
    alt: photo.alt_description ?? 'A landscape photo',
    color: photo.color,
  }
}

/**
 * The photo of the day for the empty article pane: kept in D1, so Unsplash
 * is asked once a day (on the first empty pane of the owner's day, `day`
 * being their local date). The image itself is hotlinked from Unsplash, as
 * its API terms require, and the browser caches it.
 *
 * The fixed fallback when there is no access key, under `alchemy dev` (so
 * local work never spends the API's quota), or when Unsplash fails; a
 * failure isn't kept, so the next pane tries again.
 */
export const getBackdrop = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({ day: Schema.String.check(Schema.isPattern(DAY_PATTERN)) })
    )
  )
  .handler(async ({ data, context }): Promise<Backdrop> => {
    const { env } = context
    const accessKey = env.UNSPLASH_ACCESS_KEY

    if (accessKey === '' || env.LOCAL_DEV === 'true') return FALLBACK_BACKDROP

    const db = dbFor(env)
    const kept = await getDailyBackdrop(db, data.day)

    if (kept !== null) return kept

    try {
      return await saveDailyBackdrop(
        db,
        data.day,
        await fetchPhoto(accessKey),
        Date.now()
      )
    } catch (error) {
      console.warn('backdrop: using the fallback photo', error)

      return FALLBACK_BACKDROP
    }
  })
