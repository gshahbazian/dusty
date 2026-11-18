import { Link } from '@tanstack/react-router'

const SECTIONS = [
  { to: '/settings', label: 'Subscriptions' },
  { to: '/settings/import', label: 'Import' },
  { to: '/settings/account', label: 'Account' },
] as const

/**
 * Settings' sections. Links, not tabs: each is its own page. The router
 * marks the current one (`data-status="active"`, `aria-current="page"`).
 */
export function SettingsNav() {
  return (
    <nav
      aria-label="Settings sections"
      // On a phone a row that scrolls on its own, edge to edge, so a narrow
      // screen never scrolls the whole page sideways.
      className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:w-40 sm:shrink-0 sm:flex-col sm:overflow-visible sm:px-0"
    >
      {SECTIONS.map((section) => (
        <Link
          key={section.to}
          to={section.to}
          // Subscriptions is `/settings` itself, so only an exact match.
          activeOptions={{ exact: true, includeSearch: false }}
          className="text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground focus-visible:ring-ring/50 flex shrink-0 items-center px-3 py-1.5 text-sm whitespace-nowrap outline-none focus-visible:ring-1 data-[status=active]:font-medium pointer-coarse:min-h-11"
        >
          {section.label}
        </Link>
      ))}
    </nav>
  )
}
