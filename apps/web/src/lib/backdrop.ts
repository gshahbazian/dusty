/**
 * The empty article pane's photo of the day: what the server sends, the
 * one shown when it has nothing better, and which day it is. Plain data shared by the server function
 * (`server/backdrop.ts`) and the page.
 */

/** A photo for the empty article pane (shown without a credit line). */
export interface Backdrop {
  readonly imageUrl: string
  readonly alt: string
  /** The photo's main colour, shown while it loads. */
  readonly color: string | null
}

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

/** A local date, YYYY-MM-DD: which day's photo to show. */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `date`'s day where the owner is (the browser's time zone). */
export const localDay = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
