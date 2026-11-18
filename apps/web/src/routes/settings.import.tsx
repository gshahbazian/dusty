import { createFileRoute, useRouter } from '@tanstack/react-router'

import { OpmlImport } from '#/components/subscriptions/opml-import'

/** Settings' Import section: subscriptions from another reader's OPML. */
export const Route = createFileRoute('/settings/import')({
  component: Import,
})

function Import() {
  const router = useRouter()

  return (
    <>
      <h1 className="sr-only">Import</h1>
      {/* The subscriptions list is cached; invalidate it so going back to
          it shows what was imported. */}
      <OpmlImport onImported={() => void router.invalidate()} />
    </>
  )
}
