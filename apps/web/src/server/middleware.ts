import { createMiddleware } from '@tanstack/react-start'

/**
 * Every server function uses this. The Worker entry already refused anyone
 * who is not the owner; this re-checks so a server function can never run
 * without a viewer, even if the entry is changed later.
 */
export const ownerOnly = createMiddleware({ type: 'function' }).server(
  ({ context, next }) => {
    if (context.viewer.kind !== 'owner') {
      throw new Response('Forbidden', { status: 403 })
    }

    return next()
  }
)
