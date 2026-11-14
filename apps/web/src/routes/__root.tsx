import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'

import { getSession, requestSync } from '../server/functions.ts'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  loader: () => getSession(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { name: 'color-scheme', content: 'light dark' },
      { title: 'Dusty' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: AppLayout,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** "Unread" covers the global list and every feed's list. */
const isUnreadPath = (pathname: string): boolean =>
  pathname === '/' || pathname.startsWith('/feeds/')

function AppLayout() {
  const session = Route.useLoaderData()

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const unreadActive = isUnreadPath(pathname)

  // Loading the app starts a background sync; pages never wait for it.
  useEffect(() => {
    void requestSync({ data: 'on_load' })
  }, [])

  return (
    <div
      className={`mx-auto px-4 pb-16 ${unreadActive ? 'max-w-[96rem]' : 'max-w-4xl'}`}
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 py-3 dark:border-neutral-800">
        <span className="mr-2 font-semibold">Dusty</span>
        <nav className="flex flex-1 items-center gap-1" aria-label="Main">
          <Link
            to="/"
            className={`rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 ${unreadActive ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100' : ''}`}
            aria-current={unreadActive ? 'page' : undefined}
          >
            Unread
          </Link>
          <Link
            to="/subscriptions"
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            activeProps={{
              className:
                'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
            }}
          >
            Subscriptions
          </Link>
        </nav>
        <a
          href={session.logoutUrl}
          className="text-sm text-neutral-500 hover:underline"
          title={`Signed in as ${session.email}`}
        >
          Log out
        </a>
      </header>
      <main className="pt-6">
        <Outlet />
      </main>
    </div>
  )
}
