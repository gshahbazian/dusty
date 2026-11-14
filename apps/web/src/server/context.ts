import type { WebEnv } from '~/alchemy.run'
import type { Viewer } from '#/server/auth/index'

/**
 * Passed from the Worker entry into every server function. A request only
 * gets this far once auth has found the owner, so `viewer` is always set.
 */
export interface RequestContext {
  readonly viewer: Viewer
  /** Where to send the browser to log out; comes from the auth provider. */
  readonly logoutUrl: string
  /** This response's CSP nonce; the router puts it on every script. */
  readonly nonce: string
  readonly env: WebEnv
  readonly waitUntil: (promise: Promise<unknown>) => void
}

declare module '@tanstack/react-start' {
  interface Register {
    server: { requestContext: RequestContext }
  }
}
