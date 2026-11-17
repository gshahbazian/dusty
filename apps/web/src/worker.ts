import startHandler from '@tanstack/react-start/server-entry'

import type { WebEnv } from '~/alchemy.run'
import { authFromEnv, type AuthProvider } from '#/server/auth/index'
import { withAssetCaching } from '#/server/asset-cache'
import { PUBLIC_PATHS } from '#/server/public-paths'
import { createNonce, withSecurityHeaders } from '#/server/security-headers'

let auth: AuthProvider | undefined

/**
 * The Worker entry. Every request comes here first, static assets included
 * (`runWorkerFirst`), and nothing but the home screen icon is served until
 * auth says it is from the owner.
 */
export default {
  async fetch(
    request: Request,
    env: WebEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    auth ??= authFromEnv(env)

    // A fresh nonce per response: the CSP only lets scripts carrying it run.
    const csp = { nonce: createNonce(), dev: env.AUTH_MODE === 'dev' }
    const readsFile = request.method === 'GET' || request.method === 'HEAD'

    // The home screen icon, for anyone (see `PUBLIC_PATHS`).
    if (
      env.ASSETS !== undefined &&
      readsFile &&
      PUBLIC_PATHS.includes(new URL(request.url).pathname)
    ) {
      return withSecurityHeaders(await env.ASSETS.fetch(request), csp)
    }

    const viewer = await auth.identify(request)

    if (viewer === null) {
      return withSecurityHeaders(
        new Response('Forbidden', { status: 403 }),
        csp
      )
    }

    if (env.ASSETS !== undefined && readsFile) {
      const asset = await env.ASSETS.fetch(request)

      if (asset.status !== 404) {
        return withSecurityHeaders(withAssetCaching(request, asset), csp)
      }
    }

    const response = await startHandler.fetch(request, {
      context: {
        viewer,
        logoutUrl: auth.logoutUrl,
        nonce: csp.nonce,
        env,
        waitUntil: (promise) => ctx.waitUntil(promise),
      },
    })

    return withSecurityHeaders(response, csp)
  },
} satisfies ExportedHandler<WebEnv>
