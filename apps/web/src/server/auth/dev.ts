import type { AuthProvider, Viewer } from '#/server/auth/types'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Local development stand-in for a login: every request is the owner, but
 * only when it is addressed to this machine. Even if this provider were
 * somehow enabled on a deployed Worker, requests to its public hostname would
 * be refused.
 */
export const createDevAuth = (ownerEmail: string): AuthProvider => {
  const viewer: Viewer = {
    kind: 'owner',
    email: ownerEmail.trim().toLowerCase(),
  }

  const identify = async (request: Request): Promise<Viewer | null> =>
    LOCAL_HOSTS.has(new URL(request.url).hostname) ? viewer : null

  return { identify, logoutUrl: '/' }
}
