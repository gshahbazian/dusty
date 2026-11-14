import { cn } from 'cn'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'

import { KeyboardShortcuts } from '../components/keyboard/KeyboardShortcuts.tsx'
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
      // Added to a phone's home screen, it opens full screen like an app.
      {
        name: 'theme-color',
        content: '#ffffff',
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: '#0a0a0a',
        media: '(prefers-color-scheme: dark)',
      },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Dusty' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // With credentials: Cloudflare Access is in front of everything, and
      // without its cookie the manifest request gets a login redirect.
      {
        rel: 'manifest',
        href: '/manifest.webmanifest',
        crossOrigin: 'use-credentials',
      },
      { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
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
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <img
          src="/logo.svg"
          alt="Dusty"
          width={32}
          height={32}
          className="mr-2 size-8"
        />
        <nav className="flex flex-1 items-center gap-1" aria-label="Main">
          <Link
            to="/"
            className={cn(
              'inline-flex items-center rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11',
              unreadActive &&
                'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
            )}
            aria-current={unreadActive ? 'page' : undefined}
          >
            Unread
          </Link>
          <Link
            to="/settings"
            className="inline-flex items-center rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
            activeProps={{
              className:
                'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
            }}
          >
            Settings
          </Link>
        </nav>
        <span className="hidden text-sm text-neutral-500 lg:inline">
          <kbd className="font-mono">?</kbd> for shortcuts
        </span>
        <a
          href={session.logoutUrl}
          className="inline-flex items-center text-sm text-neutral-500 hover:underline pointer-coarse:min-h-11"
          title={`Signed in as ${session.email}`}
        >
          Log out
        </a>
      </header>
      <main className="min-h-0 flex-1">
        <KeyboardShortcuts>
          <Outlet />
        </KeyboardShortcuts>
      </main>
    </div>
  )
}
