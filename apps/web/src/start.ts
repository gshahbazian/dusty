import { createStart } from '@tanstack/react-start'

/**
 * Dusty is a single-page app with a server. Nothing is server-rendered: the
 * Worker returns only the HTML shell, and every route renders in the browser.
 * Server functions are the app's backend.
 */
export const startInstance = createStart(() => ({ defaultSsr: false }))
