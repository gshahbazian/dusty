import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'

import { routeTree } from '#/routeTree.gen'

export function getRouter() {
  // Fetches and writes made from components (the lists come from route
  // loaders). Nothing refetches on its own: a list is a snapshot that only
  // a refresh replaces, so rows never move under the cursor.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
      mutations: { retry: false },
    },
  })

  return createRouter({
    routeTree,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
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
