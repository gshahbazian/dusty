/** Who a request is from. With one user, that is the owner or nobody. */
export type Viewer = { readonly kind: 'owner'; readonly email: string }

/**
 * The one question the rest of the app asks about login. Swapping Cloudflare
 * Access for another method means writing a new provider; nothing outside
 * this folder changes.
 */
export interface AuthProvider {
  readonly identify: (request: Request) => Promise<Viewer | null>
  /** Where to send the browser to end the session. */
  readonly logoutUrl: string
}
