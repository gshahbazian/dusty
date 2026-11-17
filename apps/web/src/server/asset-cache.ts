/**
 * How long the browser may keep a static file without asking again.
 *
 * Everything under `/assets/` is Vite's build output, each file named with
 * a hash of its contents, so a changed file is a new name: keep it for a
 * year, and never revalidate. Without this every load asked again for the
 * CSS and the font (through Access and this Worker), and the text drew in
 * a fallback font until the answer came. Cloudflare's `_headers` file
 * would not help: it doesn't apply to responses a Worker returns, and this
 * one returns every asset (`runWorkerFirst`).
 *
 * Other files (the icons, the manifest) keep their names across deploys,
 * so they keep the default: revalidate each time.
 */
export const withAssetCaching = (
  request: Request,
  response: Response
): Response => {
  // A 304 too: a browser revalidating its copy takes the rules for it from
  // the 304, and one saying max-age=0 would have it ask again every time.
  if (!response.ok && response.status !== 304) return response

  if (!new URL(request.url).pathname.startsWith('/assets/')) return response

  const cached = new Response(response.body, response)

  cached.headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  return cached
}
