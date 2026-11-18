import { createFileRoute } from '@tanstack/react-router'

import { AccountSection } from '#/components/settings/account-section'
import { getSession } from '#/server/functions'

/** Settings' Account section: who is signed in, and logging out. */
export const Route = createFileRoute('/settings/account')({
  loader: () => getSession(),
  component: Account,
})

function Account() {
  const session = Route.useLoaderData()

  return (
    <>
      <h1 className="sr-only">Account</h1>
      <AccountSection email={session.email} logoutUrl={session.logoutUrl} />
    </>
  )
}
