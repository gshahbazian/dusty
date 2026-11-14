import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as Layer from 'effect/Layer'

import type { SyncSettings } from '#/config'
import { HttpFetch } from '#/http'

const FIXTURES = join(import.meta.dirname, 'fixtures')

export const fixture = (name: string): Promise<Buffer> =>
  readFile(join(FIXTURES, name))

export const testSettings = (
  overrides: Partial<SyncSettings> = {}
): SyncSettings => ({
  skipWindowMs: 5 * 60_000,
  leaseMarginMs: 10_000,
  scheduledBudgetMs: 60_000,
  onDemandBudgetMs: 60_000,
  concurrency: 6,
  feedTimeoutMs: 2_000,
  maxFeedBytes: 1024 * 1024,
  userAgent: 'Dusty-test',
  readRetentionMs: 14 * 24 * 3_600_000,
  prunedItemRetentionMs: 30 * 24 * 3_600_000,
  failingAfterMs: 48 * 3_600_000,
  staleAfterMs: 90 * 24 * 3_600_000,
  ...overrides,
})

export type Handler = (request: Request) => Response | Promise<Response>

/**
 * A stand-in for the internet: each URL gets a handler, and any other URL
 * fails like an unreachable host. Every request is recorded.
 */
export const fakeWeb = (routes: Readonly<Record<string, Handler>>) => {
  const requests: Request[] = []

  const layer = Layer.succeed(
    HttpFetch,
    HttpFetch.of({
      fetch: async (request) => {
        requests.push(request)

        const handler = routes[request.url]

        if (handler === undefined) throw new TypeError('fetch failed')

        return handler(request)
      },
    })
  )

  return { layer, requests }
}

/** Serve a fixture file, with optional extra headers. */
export const serve =
  (name: string, headers: Readonly<Record<string, string>> = {}): Handler =>
  async () =>
    new Response(await fixture(name), {
      headers: { 'content-type': 'application/xml', ...headers },
    })

/** A host that never answers, until the request is aborted. */
export const hang: Handler = (request) =>
  new Promise((_, reject) => {
    request.signal.addEventListener('abort', () =>
      reject(request.signal.reason)
    )
  })
