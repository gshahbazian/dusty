import { createAccessAuth } from './access.ts'
import { createDevAuth } from './dev.ts'
import type { AuthProvider, Viewer } from './types.ts'

export type { AuthProvider, Viewer }

export { createAccessAuth, createDevAuth }

export interface AuthEnv {
  readonly AUTH_MODE?: string
  readonly OWNER_EMAIL?: string
  readonly ACCESS_TEAM_DOMAIN?: string
  readonly ACCESS_AUD?: string
}

/** Refuses everyone. Used whenever auth config is missing or unknown. */
export const denyAll: AuthProvider = {
  identify: async () => null,
  logoutUrl: '/',
}

/**
 * Pick the provider from config. Anything incomplete or unrecognised fails
 * closed: no one gets in.
 */
export const authFromEnv = (env: AuthEnv): AuthProvider => {
  const { AUTH_MODE, OWNER_EMAIL, ACCESS_TEAM_DOMAIN, ACCESS_AUD } = env

  if (OWNER_EMAIL === undefined || OWNER_EMAIL === '') return denyAll

  if (AUTH_MODE === 'access' && ACCESS_TEAM_DOMAIN && ACCESS_AUD) {
    return createAccessAuth({
      teamDomain: ACCESS_TEAM_DOMAIN,
      audience: ACCESS_AUD,
      ownerEmail: OWNER_EMAIL,
    })
  }

  if (AUTH_MODE === 'dev') return createDevAuth(OWNER_EMAIL)

  return denyAll
}
