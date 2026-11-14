import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select.tsx'

import { AccountSection } from '../components/settings/account-section.tsx'
import { AddFeedForm } from '../components/subscriptions/add-feed-form.tsx'
import {
  needsAttention,
  sortSubscriptions,
  type SortOrder,
} from '../components/subscriptions/health.ts'
import { parseSubscriptionsSearch } from '../components/subscriptions/search.ts'
import { OpmlImport } from '../components/subscriptions/opml-import.tsx'
import { SubscriptionRow } from '../components/subscriptions/subscription-row.tsx'
import { getSession } from '../server/functions.ts'
import { getSubscriptions } from '../server/subscriptions.ts'

const SORTS: ReadonlyArray<{
  readonly value: SortOrder
  readonly label: string
}> = [
  { value: 'attention', label: 'Problems first' },
  { value: 'name', label: 'Name' },
  { value: 'unread', label: 'Unread' },
]

const isSortOrder = (value: string): value is SortOrder =>
  SORTS.some((sort) => sort.value === value)

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
  const { sort = 'attention', attention = false } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [highlighted, setHighlighted] = useHighlight()

  const reload = () => void router.invalidate()
  const attentionCount = subscriptions.filter(needsAttention).length

  const shown = sortSubscriptions(
    attention ? subscriptions.filter(needsAttention) : subscriptions,
    sort
  )

  return (
    <div className="h-full overflow-y-auto">
      <section className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6">
        <h1 className="text-xl font-semibold">Settings</h1>

        <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
          <div className="sm:flex-1">
            <AddFeedForm
              onAdded={(feedId) => {
                reload()
                setHighlighted(feedId)
              }}
              onShowExisting={(feedId) => {
                void navigate({ search: { sort, attention: false } })
                setHighlighted(feedId)
              }}
            />
          </div>
          <div className="sm:w-64">
            <OpmlImport onImported={reload} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">
              {subscriptions.length === 1
                ? '1 feed'
                : `${subscriptions.length} feeds`}
              {attentionCount > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {attentionCount} need attention
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <Label>
                <Checkbox
                  checked={attention}
                  onCheckedChange={(checked) =>
                    void navigate({
                      search: { sort: sort, attention: checked },
                    })
                  }
                />
                Only feeds that need attention
              </Label>
              <Label>
                Sort
                <NativeSelect
                  value={sort}
                  onChange={(event) => {
                    const sort = event.target.value

                    if (!isSortOrder(sort)) return

                    void navigate({
                      search: { sort, attention },
                    })
                  }}
                >
                  {SORTS.map((sort) => (
                    <NativeSelectOption key={sort.value} value={sort.value}>
                      {sort.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Label>
            </div>
          </div>

          {subscriptions.length === 0 && (
            <p className="text-muted-foreground">
              No feeds yet. Add one above, or import your subscriptions from
              another reader.
            </p>
          )}
          {subscriptions.length > 0 && shown.length === 0 && (
            <p className="text-muted-foreground">Every feed is healthy.</p>
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

        <AccountSection email={session.email} logoutUrl={session.logoutUrl} />
      </section>
    </div>
  )
}
