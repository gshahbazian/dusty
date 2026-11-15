/**
 * The empty article pane's photo: what the server sends, and the one shown
 * when it has nothing better. Plain data shared by the server function
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
