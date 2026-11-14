import { createRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // Opening an article is a navigation, and restoration would carry the
    // last article's scroll offset over to the next (when it loads fast
    // enough to keep it). The article pane starts at the top instead, every
    // time (going Back included: the article loads again).
    scrollToTopSelectors: ['#article-pane'],
    // On the server, this request's CSP nonce, so every script the shell
    // renders may run. In the browser there is none to set.
    ssr: { nonce: getGlobalStartContext()?.nonce },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
