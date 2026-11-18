import { createFileRoute, Outlet } from '@tanstack/react-router'

import { SettingsNav } from '#/components/settings/settings-nav'

/**
 * Settings: a side nav (a row on a phone) and the section it picks. Each
 * section is its own route, loading only what it shows.
 */
export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
})

function SettingsLayout() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:flex-row sm:gap-10">
        <SettingsNav />
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
