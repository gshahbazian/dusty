import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { cn } from 'cn'
import { ArrowDownWideNarrowIcon, ListFilterIcon } from 'lucide-react'

import { ChoiceMenu } from '#/components/subscriptions/choice-menu'
import { AccountSection } from '#/components/settings/account-section'
import { AddFeedForm } from '#/components/subscriptions/add-feed-form'
import {
  needsAttention,
  sortSubscriptions,
  type SortOrder,
} from '#/components/subscriptions/health'
import {
  parseSubscriptionsSearch,
  type SettingsTab,
} from '#/components/subscriptions/search'
import { OpmlImport } from '#/components/subscriptions/opml-import'
import { SubscriptionRow } from '#/components/subscriptions/subscription-row'
import { getSession } from '#/server/functions'
import { getSubscriptions } from '#/server/subscriptions'

const SORTS: ReadonlyArray<{
  readonly value: SortOrder
  readonly label: string
}> = [
  { value: 'attention', label: 'Problems first' },
  { value: 'name', label: 'Name' },
  { value: 'unread', label: 'Unread' },
]

const TABS: ReadonlyArray<{
  readonly value: SettingsTab
  readonly label: string
}> = [
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'import', label: 'Import' },
  { value: 'account', label: 'Account' },
]

const FILTERS = [
  { value: 'all', label: 'All feeds' },
  { value: 'attention', label: 'Needs attention' },
] as const

export const Route = createFileRoute('/settings')({
  validateSearch: parseSubscriptionsSearch,
  loader: async () => {
    const [list, session] = await Promise.all([
      getSubscriptions(),
      getSession(),
    ])

    return { ...list, session }
  },
  component: Settings,
})

/** Scroll a feed's row into view and flash it, for "already subscribed". */
function useHighlight() {
  const [highlighted, setHighlighted] = useState<number | null>(null)

  useEffect(() => {
    if (highlighted === null) return

    document
      .getElementById(`feed-${highlighted}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const clear = setTimeout(() => setHighlighted(null), 2500)

    return () => clearTimeout(clear)
  }, [highlighted])

  return [highlighted, setHighlighted] as const
}

/** Settings: the subscriptions, with adding, importing and their health. */
function Settings() {
  const { subscriptions, now, session } = Route.useLoaderData()

  const {
    tab = 'subscriptions',
    sort = 'attention',
    attention = false,
  } = Route.useSearch()

  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [highlighted, setHighlighted] = useHighlight()

  const reload = () => void router.invalidate()

  const shown = sortSubscriptions(
    attention ? subscriptions.filter(needsAttention) : subscriptions,
    sort
  )

  return (
    <div className="h-full overflow-y-auto">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
          <nav
            aria-label="Settings sections"
            className="flex gap-1 sm:w-40 sm:shrink-0 sm:flex-col"
          >
            {TABS.map((item) => (
              <Link
                key={item.value}
                from={Route.fullPath}
                search={{ tab: item.value }}
                aria-current={tab === item.value ? 'page' : undefined}
                className={cn(
                  'px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  tab === item.value && 'bg-muted font-medium text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-8">
            {tab === 'subscriptions' && (
              <>
                <AddFeedForm
                  onAdded={(feedId) => {
                    reload()
                    setHighlighted(feedId)
                  }}
                  onShowExisting={(feedId) => {
                    void navigate({ search: { tab, sort, attention: false } })
                    setHighlighted(feedId)
                  }}
                />
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChoiceMenu
                      label="Filter"
                      icon={ListFilterIcon}
                      value={attention ? 'attention' : 'all'}
                      choices={FILTERS}
                      onChange={(filter) =>
                        void navigate({
                          search: {
                            tab,
                            sort,
                            attention: filter === 'attention',
                          },
                        })
                      }
                    />
                    <ChoiceMenu
                      label="Sort"
                      icon={ArrowDownWideNarrowIcon}
                      value={sort}
                      choices={SORTS}
                      onChange={(sort) =>
                        void navigate({ search: { tab, sort, attention } })
                      }
                    />
                  </div>

                  {subscriptions.length === 0 && (
                    <p className="text-muted-foreground">
                      No feeds yet. Add one above, or import your subscriptions
                      from another reader.
                    </p>
                  )}
                  {subscriptions.length > 0 && shown.length === 0 && (
                    <p className="text-muted-foreground">
                      Every feed is healthy.
                    </p>
                  )}

                  <ul aria-label="Subscriptions">
                    {shown.map((subscription) => (
                      <SubscriptionRow
                        key={subscription.id}
                        subscription={subscription}
                        now={now}
                        highlighted={highlighted === subscription.id}
                        onChanged={reload}
                      />
                    ))}
                  </ul>
                </div>
              </>
            )}
            {tab === 'import' && <OpmlImport onImported={reload} />}
            {tab === 'account' && (
              <AccountSection
                email={session.email}
                logoutUrl={session.logoutUrl}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
