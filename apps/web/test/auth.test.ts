import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from 'jose'
import { beforeAll, describe, expect, test } from 'vitest'

import {
  authFromEnv,
  createAccessAuth,
  createDevAuth,
} from '#/server/auth/index'

const TEAM = 'https://dusty-test.cloudflareaccess.com'
const AUD = 'aud-of-the-dusty-app'
const OWNER = 'owner@example.com'
const APP_URL = 'https://dusty.example.workers.dev/'

let signingKey: CryptoKey
let otherKey: CryptoKey
let keys: JWTVerifyGetKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const other = await generateKeyPair('RS256')
  const jwk = await exportJWK(pair.publicKey)

  signingKey = pair.privateKey
  otherKey = other.privateKey
  keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256' }] })
})

interface TokenOptions {
  readonly email?: string
  readonly aud?: string
  readonly iss?: string
  readonly expiresIn?: string
  readonly key?: CryptoKey
}

const token = (options: TokenOptions = {}) =>
  new SignJWT({ email: options.email ?? OWNER })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(options.iss ?? TEAM)
    .setAudience(options.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.key ?? signingKey)

const request = (jwt?: string, url = APP_URL) => {
  if (jwt === undefined) return new Request(url)

  return new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': jwt } })
}

describe('Access provider', () => {
  const auth = () =>
    createAccessAuth({
      teamDomain: TEAM,
      audience: AUD,
      ownerEmail: OWNER,
      keys,
    })

  test('a valid owner token that came through Access is the owner', async () => {
    expect(await auth().identify(request(await token()))).toEqual({
      kind: 'owner',
      email: OWNER,
    })
  })

  test('email matching ignores case', async () => {
    const jwt = await token({ email: 'Owner@Example.COM' })

    expect(await auth().identify(request(jwt))).not.toBeNull()
  })

  test('no token is refused', async () => {
    expect(await auth().identify(request())).toBeNull()
  })

  test('a token for another Access application is refused', async () => {
    const jwt = await token({ aud: 'some-other-app' })

    expect(await auth().identify(request(jwt))).toBeNull()
  })

  test('a token from another team is refused', async () => {
    const jwt = await token({ iss: 'https://evil.cloudflareaccess.com' })

    expect(await auth().identify(request(jwt))).toBeNull()
  })

  test('an expired token is refused', async () => {
    const jwt = await token({ expiresIn: '-1m' })

    expect(await auth().identify(request(jwt))).toBeNull()
  })

  test('a token signed by another key is refused', async () => {
    const jwt = await token({ key: otherKey })

    expect(await auth().identify(request(jwt))).toBeNull()
  })

  test('an unsigned token is refused', async () => {
    const header = btoa(JSON.stringify({ alg: 'none' })).replaceAll('=', '')

    const body = btoa(
      JSON.stringify({ email: OWNER, aud: AUD, iss: TEAM })
    ).replaceAll('=', '')

    expect(await auth().identify(request(`${header}.${body}.`))).toBeNull()
  })

  test('someone other than the owner is refused', async () => {
    const jwt = await token({ email: 'stranger@example.com' })

    expect(await auth().identify(request(jwt))).toBeNull()
  })

  test('garbage is refused', async () => {
    expect(await auth().identify(request('not-a-jwt'))).toBeNull()
  })
})

describe('dev provider', () => {
  const auth = createDevAuth(OWNER)

  test.each([
    'http://localhost:5173/',
    'http://127.0.0.1:1337/',
    'http://[::1]:5173/',
  ])('requests to this machine (%s) are the owner', async (url) => {
    expect(await auth.identify(request(undefined, url))).toEqual({
      kind: 'owner',
      email: OWNER,
    })
  })

  test('requests to any other host are refused', async () => {
    expect(await auth.identify(request(undefined, APP_URL))).toBeNull()
  })
})

describe('authFromEnv', () => {
  const ownerViaDev = request(undefined, 'http://localhost:5173/')

  test('dev mode uses the localhost stand-in', async () => {
    const auth = authFromEnv({ AUTH_MODE: 'dev', OWNER_EMAIL: OWNER })

    expect(await auth.identify(ownerViaDev)).not.toBeNull()
  })

  test.each([
    { name: 'no owner email', env: { AUTH_MODE: 'dev' } },
    { name: 'an unknown mode', env: { AUTH_MODE: 'open', OWNER_EMAIL: OWNER } },
    { name: 'no mode', env: { OWNER_EMAIL: OWNER } },
    {
      name: 'access mode without a team domain',
      env: { AUTH_MODE: 'access', OWNER_EMAIL: OWNER, ACCESS_AUD: AUD },
    },
    {
      name: 'access mode without an audience',
      env: {
        AUTH_MODE: 'access',
        OWNER_EMAIL: OWNER,
        ACCESS_TEAM_DOMAIN: TEAM,
      },
    },
  ])('fails closed with $name', async ({ env }) => {
    const auth = authFromEnv(env)

    expect(await auth.identify(ownerViaDev)).toBeNull()
  })
})
