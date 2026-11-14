/**
 * The Content Security Policy for every response. Article HTML comes from
 * strangers: it is cleaned when stored, and this is the second layer.
 *
 * - Scripts: only those the app rendered with this request's nonce, and the
 *   app chunks they load (`'strict-dynamic'`). Nothing else runs.
 * - Everything else is off unless the app needs it: its own styles, fonts
 *   and API calls, and images over https (article images).
 * - No frames, plugins, or form posts elsewhere; no `<base>` tricks.
 *
 * `alchemy dev` needs a little more: Vite injects styles from scripts and
 * talks to its dev server over a websocket.
 */
export const contentSecurityPolicy = (options: {
  readonly nonce: string
  readonly dev: boolean
}): string => {
  const { nonce, dev } = options

  const directives: ReadonlyArray<readonly [string, ...string[]]> = [
    ['default-src', "'none'"],
    ['script-src', `'nonce-${nonce}'`, "'strict-dynamic'"],
    ['style-src', "'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    ['img-src', "'self'", 'https:', ...(dev ? ['http:'] : [])],
    ['media-src', 'https:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...(dev ? ['ws:'] : [])],
    ['manifest-src', "'self'"],
    ['worker-src', "'self'"],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]

  return directives.map((directive) => directive.join(' ')).join('; ')
}

/** A fresh, unguessable nonce for one response. */
export const createNonce = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  return btoa(String.fromCharCode(...bytes))
}

export const withSecurityHeaders = (
  response: Response,
  csp: { readonly nonce: string; readonly dev: boolean }
): Response => {
  const secured = new Response(response.body, response)

  secured.headers.set('X-Content-Type-Options', 'nosniff')
  secured.headers.set('Referrer-Policy', 'no-referrer')
  secured.headers.set('X-Frame-Options', 'DENY')
  secured.headers.set('Content-Security-Policy', contentSecurityPolicy(csp))

  return secured
}
