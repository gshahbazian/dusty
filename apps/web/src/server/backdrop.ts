import { createServerFn } from '@tanstack/react-start'
import * as Schema from 'effect/Schema'

import {
  getDailyBackdrop,
  getLatestBackdrop,
  saveDailyBackdrop,
} from '@dusty/db'

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
  links: Schema.Struct({
    html: Schema.String,
    download_location: Schema.String,
  }),
  user: Schema.Struct({
    name: Schema.String,
    links: Schema.Struct({ html: Schema.String }),
  }),
})

const decodePhoto = Schema.decodeUnknownSync(Photo)

/** Only Unsplash's own https addresses are shown, linked or called. */
const onUnsplash = (raw: string, host: string): string | null => {
  try {
    const url = new URL(raw)

    return url.protocol === 'https:' && url.hostname === host ? url.href : null
  } catch {
    return null
  }
}

/** A photo from Unsplash, and the address that counts it as used. */
interface Fetched {
  readonly backdrop: Backdrop
  readonly downloadLocation: string
}

const unsplashHeaders = (accessKey: string) => ({
  Authorization: `Client-ID ${accessKey}`,
  'Accept-Version': 'v1',
})

/** Ask Unsplash for a photo: the one API call a day. */
const fetchPhoto = async (accessKey: string): Promise<Fetched> => {
  const response = await fetch(UNSPLASH_RANDOM, {
    headers: unsplashHeaders(accessKey),
  })

  if (!response.ok) throw new Error(`Unsplash answered ${response.status}`)

  const photo = decodePhoto(await response.json())
  const imageUrl = onUnsplash(photo.urls.regular, 'images.unsplash.com')
  const photoUrl = onUnsplash(photo.links.html, 'unsplash.com')
  const photographerUrl = onUnsplash(photo.user.links.html, 'unsplash.com')

  const downloadLocation = onUnsplash(
    photo.links.download_location,
    'api.unsplash.com'
  )

  if (
    imageUrl === null ||
    photoUrl === null ||
    photographerUrl === null ||
    downloadLocation === null
  ) {
    throw new Error('Unsplash sent an unexpected address')
  }

  return {
    backdrop: {
      imageUrl,
      alt: photo.alt_description ?? 'A landscape photo',
      color: photo.color,
      photographerName: photo.user.name,
      photographerUrl,
      photoUrl,
    },
    downloadLocation,
  }
}

/**
 * Tell Unsplash the photo was used, as its API guidelines ask when an app
 * sets a photo as a background: a request to the photo's
 * `download_location` (all its query kept), signed with the access key.
 * It only counts; nothing is downloaded. A failure is logged, not shown.
 */
const trackDownload = async (
  accessKey: string,
  downloadLocation: string
): Promise<void> => {
  try {
    const response = await fetch(downloadLocation, {
      headers: unsplashHeaders(accessKey),
    })

    if (!response.ok) {
      console.warn(`backdrop: download tracking got ${response.status}`)
    }
  } catch (error) {
    console.warn('backdrop: download tracking failed', error)
  }
}

/**
 * The photo of the day for the empty article pane: kept in D1, so Unsplash
 * is asked once a day (on the first empty pane of the owner's day, `day`
 * being their local date). The image itself is hotlinked from Unsplash, as
 * its API guidelines require, and the browser caches it. Choosing the
 * day's photo is what sets it as the pane's background, so that is when
 * its download is counted, once, after the answer is sent.
 *
 * When Unsplash fails, the newest kept photo (yesterday's) is shown; a
 * failure isn't kept, so the next pane tries again. The fixed fallback
 * when there is none, no access key, or under `alchemy dev` (so local work
 * never spends the API's quota). Every one of them carries its credit.
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
      const fetched = await fetchPhoto(accessKey)

      const saved = await saveDailyBackdrop(
        db,
        data.day,
        fetched.backdrop,
        Date.now()
      )

      // Two panes racing for the day both fetch; only the photo kept is used.
      if (saved.imageUrl === fetched.backdrop.imageUrl) {
        context.waitUntil(trackDownload(accessKey, fetched.downloadLocation))
      }

      return saved
    } catch (error) {
      console.warn('backdrop: using an earlier photo', error)

      return (await getLatestBackdrop(db)) ?? FALLBACK_BACKDROP
    }
  })
