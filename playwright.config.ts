import { defineConfig } from '@playwright/test'

import { DEV_WEB_PORT } from './infra/dev.ts'

/**
 * End-to-end tests run against a running local stack (`pnpm dev`). They use
 * the dev login stand-in, so no Cloudflare account is involved.
 */
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env['DUSTY_URL'] ?? `http://localhost:${DEV_WEB_PORT}`,
  },
})
