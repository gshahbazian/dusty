/**
 * Fixed ports for `alchemy dev`. The web app is the one to open; the sync
 * service's port is only for poking it directly while developing (deployed,
 * it has no public URL).
 */
export const DEV_WEB_PORT = 5173
export const DEV_SYNC_PORT = 5174

/**
 * The local feed server (`.agents/skills/local-dev/scripts/feed-server.mjs`):
 * the sync test fixtures over HTTP, so dev syncs need no internet.
 */
export const DEV_FEEDS_PORT = 5175
