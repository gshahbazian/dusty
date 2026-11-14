import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

import { DEV_WEB_PORT } from '~/infra/dev'

/**
 * End-to-end tests run against a running local stack (`pnpm dev`). They use
 * the dev login stand-in, so no Cloudflare account is involved.
 */
const use: PlaywrightTestConfig['use'] = {
  baseURL: process.env['DUSTY_URL'] ?? `http://localhost:${DEV_WEB_PORT}`,
}

// An already installed Chromium, for machines that cannot download
// Playwright's own build (a sandbox whose network blocks the Playwright CDN).
const chromiumPath = process.env['DUSTY_CHROMIUM_PATH']

if (chromiumPath) {
  use.launchOptions = { executablePath: chromiumPath }
}

export default defineConfig({ testDir: './e2e', use })
