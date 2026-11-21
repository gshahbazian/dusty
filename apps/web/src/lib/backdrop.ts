/**
 * The empty article pane's photo of the day: what the server sends, the
 * one shown when it has nothing better, which day it is, and how its
 * credit links back to Unsplash. Plain data and helpers shared by the
 * server function (`server/backdrop.ts`) and the page.
 */

/**
 * A photo for the empty article pane, with the credit Unsplash's API
 * guidelines require: the photographer, linked to their Unsplash profile,
 * and Unsplash itself. The links are stored bare; `withReferral` tags them
 * when shown.
 */
export interface Backdrop {
  readonly imageUrl: string
  readonly alt: string
  /** The photo's main colour, shown while it loads. */
  readonly color: string | null
  readonly photographerName: string
  /** The photographer's unsplash.com profile. */
  readonly photographerUrl: string
  /** The photo's own unsplash.com page. */
  readonly photoUrl: string
}

/**
 * Shown when there is no photo of the day and none kept from an earlier
 * day (no access key, under `alchemy dev`, or Unsplash failing on the
 * very first day): one fixed calm landscape, credited like any other.
 */
export const FALLBACK_BACKDROP: Backdrop = {
  imageUrl:
    'https://images.unsplash.com/photo-1761880743944-af860cbcc211?w=1600&q=80&auto=format&fit=crop',
  alt: 'Calm lake reflecting mountains and trees at sunrise',
  color: null,
  photographerName: 'Deep Doshi',
  photographerUrl: 'https://unsplash.com/@shotfromdeep',
  photoUrl:
    'https://unsplash.com/photos/calm-lake-reflecting-mountains-and-trees-at-sunrise-0v6hKTAWaGk',
}

/** Unsplash's home page, the "on Unsplash" in every credit. */
export const UNSPLASH_HOME = 'https://unsplash.com/'

/**
 * The app's name in the referral tags on every link back to Unsplash
 * (`utm_source`), as the API guidelines ask.
 */
export const UNSPLASH_APP_NAME = 'dusty'

/**
 * `url` with Unsplash's referral tags: `utm_source` (this app) and
 * `utm_medium=referral`. Any other query it has is kept.
 */
export const withReferral = (url: string): string => {
  const tagged = new URL(url)

  tagged.searchParams.set('utm_source', UNSPLASH_APP_NAME)
  tagged.searchParams.set('utm_medium', 'referral')

  return tagged.href
}

/** A local date, YYYY-MM-DD: which day's photo to show. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `date`'s day where the owner is (the browser's time zone). */
export const localDay = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
