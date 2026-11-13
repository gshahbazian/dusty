/**
 * Headers on every response. The full Content Security Policy for article
 * pages (with nonces) arrives with article rendering in M3; this baseline
 * already blocks framing, plugins and foreign form posts.
 */
const HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'no-referrer'],
  ['X-Frame-Options', 'DENY'],
  [
    'Content-Security-Policy',
    "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
  ],
]

export const withSecurityHeaders = (response: Response): Response => {
  const secured = new Response(response.body, response)

  for (const [name, value] of HEADERS) secured.headers.set(name, value)

  return secured
}
