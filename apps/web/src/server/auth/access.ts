import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'

import type { AuthProvider, Viewer } from '#/server/auth/types'

export interface AccessAuthOptions {
  /** e.g. `https://myteam.cloudflareaccess.com` */
  readonly teamDomain: string
  /**
   * The Access application's audience (AUD) tag. Only tokens issued for this
   * application are accepted.
   */
  readonly audience: string
  readonly ownerEmail: string
  /** Key source; tests pass a local key set. Defaults to the team's JWKS. */
  readonly keys?: JWTVerifyGetKey
}

const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion'

/**
 * Logs why a request was turned away. The reason never includes the token or
 * the email it carried.
 */
const deny = (reason: string): null => {
  console.warn(JSON.stringify({ message: 'auth denied', reason }))

  return null
}

/** The claims Dusty relies on, checked after the signature is verified. */
const decodeClaims = Schema.decodeUnknownOption(
  Schema.Struct({ email: Schema.String })
)

/**
 * Cloudflare Access. Access stops strangers at the edge; this re-checks every
 * request anyway, so a request that reached the Worker without passing Access
 * gets nothing:
 *
 * - The signed token Access adds must verify against the team's keys, be
 *   issued by the team, and be for Dusty's Access application (its audience,
 *   from config).
 * - The token's email must be the owner's.
 *
 * The audience comes from config, not `ctx.access`: Cloudflare does not give
 * Workers with static assets `ctx.access`.
 */
export const createAccessAuth = (options: AccessAuthOptions): AuthProvider => {
  const issuer = options.teamDomain.replace(/\/+$/, '')

  const keys =
    options.keys ??
    createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))

  const ownerEmail = options.ownerEmail.trim().toLowerCase()

  const { audience } = options

  const identify = async (request: Request): Promise<Viewer | null> => {
    const token = request.headers.get(ACCESS_JWT_HEADER)

    if (token === null || token === '') return deny('no Access token header')

    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience,
        algorithms: ['RS256'],
      })

      const claims = decodeClaims(payload)

      if (Option.isNone(claims)) return deny('token has no email claim')

      if (claims.value.email.toLowerCase() !== ownerEmail) {
        return deny('token email is not the owner')
      }

      return { kind: 'owner', email: ownerEmail }
    } catch (error) {
      if (error instanceof errors.JWTClaimValidationFailed) {
        return deny(`token claim '${error.claim}' failed: ${error.reason}`)
      }

      if (error instanceof errors.JOSEError) {
        return deny(`token rejected: ${error.code}`)
      }

      return deny('token check failed')
    }
  }

  return { identify, logoutUrl: '/cdn-cgi/access/logout' }
}
