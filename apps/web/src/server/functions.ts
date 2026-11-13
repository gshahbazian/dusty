import type { Sync, OnDemandTrigger } from '@dusty/sync/contract'
import { toRpcAsync } from '@alchemy.run/cloudflare/Bridge'
import { createServerFn } from '@tanstack/react-start'

import { ownerOnly } from './middleware.ts'

const ON_DEMAND_TRIGGERS: ReadonlySet<string> = new Set<OnDemandTrigger>([
  'on_load',
  'refresh',
  'new_subscription',
])

const isOnDemandTrigger = (value: string): value is OnDemandTrigger =>
  ON_DEMAND_TRIGGERS.has(value)

/** Input arrives from the browser, so check it is a trigger the web app may start. */
const parseTrigger = (input: string): OnDemandTrigger => {
  if (!isOnDemandTrigger(input))
    throw new Error(`Unknown sync trigger: ${input}`)

  return input
}

export const getSession = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(({ context }) => ({
    email: context.viewer.email,
    logoutUrl:
      context.env.AUTH_MODE === 'access' ? '/cdn-cgi/access/logout' : '/',
  }))

/**
 * Ask the sync service to run, without waiting for it. The page never waits
 * on a sync; it shows what is stored. `waitUntil` keeps the call alive after
 * this response is sent, so the run is not cut off when the request ends.
 */
export const requestSync = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(parseTrigger)
  .handler(({ context, data: trigger }) => {
    const sync = toRpcAsync<Sync>(context.env.SYNC)

    context.waitUntil(
      sync.syncNow(trigger).catch((cause: unknown) => {
        console.error(
          JSON.stringify({
            msg: 'sync request failed',
            trigger,
            error: String(cause),
          })
        )
      })
    )

    return { requested: true as const }
  })
