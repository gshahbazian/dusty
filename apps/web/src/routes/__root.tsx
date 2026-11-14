import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'

import { buttonVariants } from '@/components/ui/button.tsx'

import { KeyboardShortcuts } from '../components/keyboard/keyboard-shortcuts.tsx'
import { requestSync } from '../server/functions.ts'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
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
      <body className="antialiased">
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Loading the app starts a background sync; pages never wait for it.
  // An effect on purpose: it's a call out when the app first appears. The
  // root route's onEnter doesn't fire on the first load, and a loader would
  // fire again after every Refresh.
  useEffect(() => {
    void requestSync({ data: 'on_load' })
  }, [])

  const unreadActive = isUnreadPath(pathname)
  const settingsActive = pathname.startsWith('/settings')

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
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
            className={buttonVariants({
              variant: unreadActive ? 'secondary' : 'ghost',
            })}
            aria-current={unreadActive ? 'page' : undefined}
          >
            Feeds
          </Link>
          <Link
            to="/settings"
            className={buttonVariants({
              variant: settingsActive ? 'secondary' : 'ghost',
            })}
            aria-current={settingsActive ? 'page' : undefined}
          >
            Settings
          </Link>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <KeyboardShortcuts>
          <Outlet />
        </KeyboardShortcuts>
      </main>
    </div>
  )
}
