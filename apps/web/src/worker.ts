import startHandler from '@tanstack/react-start/server-entry'

import type { WebEnv } from '../../../alchemy.run.ts'
import { authFromEnv, type AuthProvider } from './server/auth/index.ts'
import { withSecurityHeaders } from './server/security-headers.ts'

let auth: AuthProvider | undefined

/**
 * The Worker entry. Every request comes here first, static assets included
 * (`runWorkerFirst`), and nothing is served until auth says it is from the
 * owner.
 */
export default {
  async fetch(
    request: Request,
    env: WebEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    auth ??= authFromEnv(env)

    const viewer = await auth.identify(request)

    if (viewer === null)
      return withSecurityHeaders(new Response('Forbidden', { status: 403 }))

    if (
      env.ASSETS !== undefined &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const asset = await env.ASSETS.fetch(request)

      if (asset.status !== 404) return withSecurityHeaders(asset)
    }

    const response = await startHandler.fetch(request, {
      context: { viewer, env, waitUntil: (promise) => ctx.waitUntil(promise) },
    })

    return withSecurityHeaders(response)
  },
} satisfies ExportedHandler<WebEnv>
