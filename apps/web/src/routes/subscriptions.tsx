import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { AddFeedForm } from '../components/subscriptions/AddFeedForm.tsx'
import {
  needsAttention,
  sortSubscriptions,
  type SortOrder,
} from '../components/subscriptions/health.ts'
import { parseSubscriptionsSearch } from '../components/subscriptions/search.ts'
import { OpmlImport } from '../components/subscriptions/OpmlImport.tsx'
import { SubscriptionRow } from '../components/subscriptions/SubscriptionRow.tsx'
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

export const Route = createFileRoute('/subscriptions')({
  validateSearch: parseSubscriptionsSearch,
  loader: () => getSubscriptions(),
  component: Subscriptions,
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

function Subscriptions() {
  const { subscriptions, now } = Route.useLoaderData()
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
    <section className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Subscriptions</h1>

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
              <span className="text-neutral-500">
                {' '}
                · {attentionCount} need attention
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={attention}
                onChange={(event) =>
                  void navigate({
                    search: {
                      sort: sort,
                      attention: event.target.checked,
                    },
                  })
                }
              />
              Only feeds that need attention
            </label>
            <label className="flex items-center gap-1.5">
              Sort
              <select
                value={sort}
                onChange={(event) => {
                  const sort = event.target.value

                  if (!isSortOrder(sort)) return

                  void navigate({
                    search: { sort, attention },
                  })
                }}
                className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
              >
                {SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {subscriptions.length === 0 && (
          <p className="text-neutral-500">
            No feeds yet. Add one above, or import your subscriptions from
            another reader.
          </p>
        )}
        {subscriptions.length > 0 && shown.length === 0 && (
          <p className="text-neutral-500">Every feed is healthy.</p>
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
    </section>
  )
}
