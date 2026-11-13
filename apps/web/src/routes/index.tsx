import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { getSession, requestSync } from '../server/functions.ts'

export const Route = createFileRoute('/')({
  loader: () => getSession(),
  component: Home,
})

function Home() {
  const session = Route.useLoaderData()

  // Loading the app starts a background sync; the page never waits for it.
  useEffect(() => {
    void requestSync({ data: 'on_load' })
  }, [])

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Dusty</h1>
      <p className="mt-2 text-neutral-500">Signed in as {session.email}</p>
      <a className="mt-4 inline-block underline" href={session.logoutUrl}>
        Log out
      </a>
    </main>
  )
}
