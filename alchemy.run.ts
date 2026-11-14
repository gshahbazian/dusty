import { resolve } from 'node:path'

import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { AlchemyContext } from 'alchemy/AlchemyContext'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import { SETTING_DEFAULTS } from '~/apps/sync/src/config'
import { Sync } from '~/apps/sync/src/contract'
import SyncLive, { COMPATIBILITY_DATE } from '~/apps/sync/src/worker'
import { Database } from '~/infra/database'
import { DEV_WEB_PORT } from '~/infra/dev'

/**
 * Deployed stages get one Access application allowing only the owner. Workers
 * with static assets get no `ctx.access`, so its audience tag goes to the
 * Worker as config for checking the Access token. `alchemy dev` has no Access.
 */
const deployedAccess = Effect.fn(function* (dev: boolean, ownerEmail: string) {
  if (dev) return undefined

  const teamDomain = yield* Config.String('ACCESS_TEAM_DOMAIN').pipe(
    Effect.orDie
  )

  const application = yield* Cloudflare.Access.Application('Access', {
    type: 'self_hosted',
    policies: [{ decision: 'allow', include: [{ email: ownerEmail }] }],
    // A trusted device stays logged in for a month.
    sessionDuration: '720h',
  })

  return { teamDomain, application }
})

const healthSetting = (
  name: 'FEED_FAILING_AFTER_HOURS' | 'FEED_STALE_AFTER_DAYS'
) =>
  Config.Int(name).pipe(
    Config.withDefault(SETTING_DEFAULTS[name]),
    Config.map(String),
    Effect.orDie
  )

/**
 * The web app: a TanStack Start SPA plus its server functions, in one Worker.
 *
 * - Every request, static assets included, runs the Worker first so the
 *   auth check in `apps/web/src/worker.ts` sees it.
 * - Deployed, Cloudflare Access sits in front and allows only the owner.
 *   Under `alchemy dev` there is no Access; a localhost-only stand-in login
 *   is used instead (AUTH_MODE=dev).
 * - Preview URLs are off, so the only public address is the workers.dev one
 *   that Access covers.
 */
export class Web extends Cloudflare.Website.Vite<Web>()(
  'Web',
  Effect.gen(function* () {
    const { dev } = yield* AlchemyContext
    const ownerEmail = yield* Config.String('OWNER_EMAIL').pipe(Effect.orDie)

    const access = yield* deployedAccess(dev, ownerEmail)

    // Optional: the empty article pane's photo (Unsplash). A secret on the
    // Worker; without it the pane is just blank.
    const unsplashKey = yield* Config.Redacted('UNSPLASH_ACCESS_KEY').pipe(
      Config.withDefault(Redacted.make('')),
      Effect.orDie
    )

    // The subscriptions view shows health; it must use the same thresholds
    // as the sync service's metrics.
    const healthEnv = {
      FEED_FAILING_AFTER_HOURS: yield* healthSetting(
        'FEED_FAILING_AFTER_HOURS'
      ),
      FEED_STALE_AFTER_DAYS: yield* healthSetting('FEED_STALE_AFTER_DAYS'),
    }

    return {
      rootDir: resolve(import.meta.dirname, 'apps/web'),
      main: 'src/worker.ts',
      compatibility: { date: COMPATIBILITY_DATE },
      assets: { runWorkerFirst: true },
      workersDev: { enabled: true, previewsEnabled: false },
      observability: {
        enabled: true,
        traces: { enabled: true },
        logs: { enabled: true, invocationLogs: true },
      },
      access: access?.application,
      // Fixed local address so scripts, tests and agents can rely on it.
      dev: { port: DEV_WEB_PORT, strictPort: true },
      env: {
        DB: Database,
        SYNC: Sync,
        AUTH_MODE: dev ? 'dev' : 'access',
        // Under `alchemy dev` both Workers share one SQLite file from two
        // processes; this turns on the retry for its lock (see busy-retry.ts).
        LOCAL_DEV: dev ? 'true' : 'false',
        OWNER_EMAIL: ownerEmail,
        ACCESS_TEAM_DOMAIN: access?.teamDomain ?? '',
        ACCESS_AUD: access?.application.aud ?? '',
        UNSPLASH_ACCESS_KEY: unsplashKey,
        ...healthEnv,
      },
    }
  })
) {}

export type WebEnv = Cloudflare.InferEnv<typeof Web>

/**
 * Deployed stages keep their state in Cloudflare, so any machine can deploy.
 * `alchemy dev` keeps it in `.alchemy/` and needs no Cloudflare account.
 */
const state = Layer.unwrap(
  Effect.gen(function* () {
    const { dev } = yield* AlchemyContext

    return dev ? Alchemy.localState() : Cloudflare.state()
  })
)

export default Alchemy.Stack(
  'Dusty',
  {
    providers: Cloudflare.providers(),
    state,
  },
  Effect.gen(function* () {
    const database = yield* Database
    const web = yield* Web

    return {
      url: web.url.as<string>(),
      databaseName: database.databaseName,
    }
  }).pipe(Effect.provide(SyncLive))
)
