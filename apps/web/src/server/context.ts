import type { WebEnv } from '../../../../alchemy.run.ts'
import type { Viewer } from './auth/index.ts'

/**
 * Passed from the Worker entry into every server function. A request only
 * gets this far once auth has found the owner, so `viewer` is always set.
 */
export interface RequestContext {
  readonly viewer: Viewer
  readonly env: WebEnv
  readonly waitUntil: (promise: Promise<unknown>) => void
}

declare module '@tanstack/react-start' {
  interface Register {
    server: { requestContext: RequestContext }
  }
}
