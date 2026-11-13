import * as Cloudflare from '@alchemy.run/cloudflare'

/**
 * The one D1 database shared by the web app and the sync service. Migrations
 * are generated with drizzle-kit (`pnpm --filter @dusty/db generate`), checked
 * in, and applied on every deploy and every `alchemy dev` start.
 */
export const Database = Cloudflare.D1.Database('Database', {
  migrations: './packages/db/migrations',
})
