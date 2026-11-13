/**
 * Fixed ports for `alchemy dev`. The web app is the one to open; the sync
 * service's port is only for poking it directly while developing (deployed,
 * it has no public URL).
 */
export const DEV_WEB_PORT = 5173
export const DEV_SYNC_PORT = 5174
