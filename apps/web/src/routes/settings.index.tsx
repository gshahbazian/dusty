import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ArrowDownWideNarrowIcon, ListFilterIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AddFeedForm } from '#/components/subscriptions/add-feed-form'
import { ChoiceMenu } from '#/components/subscriptions/choice-menu'
import {
  needsAttention,
  sortSubscriptions,
  type SortOrder,
} from '#/components/subscriptions/health'
import { parseSubscriptionsSearch } from '#/components/subscriptions/search'
import { SubscriptionRow } from '#/components/subscriptions/subscription-row'
import { getSubscriptions } from '#/server/subscriptions'

const SORTS: ReadonlyArray<{
  readonly value: SortOrder
  readonly label: string
}> = [
  { value: 'name', label: 'Name' },
  { value: 'attention', label: 'Problems first' },
  { value: 'latest', label: 'Last article' },
]

const FILTERS = [
  { value: 'all', label: 'All feeds' },
  { value: 'attention', label: 'Needs attention' },
] as const

/** Settings' first section: the subscriptions, adding one, and their health. */
export const Route = createFileRoute('/settings/')({
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
  const { sort = 'name', attention = false } = Route.useSearch()
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
    <>
      <h1 className="sr-only">Subscriptions</h1>
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

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceMenu
            label="Filter"
            icon={ListFilterIcon}
            value={attention ? 'attention' : 'all'}
            choices={FILTERS}
            changed={attention}
            onChange={(filter) =>
              void navigate({
                search: { sort, attention: filter === 'attention' },
              })
            }
          />
          <ChoiceMenu
            label="Sort"
            icon={ArrowDownWideNarrowIcon}
            value={sort}
            choices={SORTS}
            changed={sort !== 'name'}
            onChange={(sort) => void navigate({ search: { sort, attention } })}
          />
          <p className="text-muted-foreground ml-2 text-xs">
            {subscriptions.length === 1
              ? '1 feed'
              : `${subscriptions.length} feeds`}
            {attentionCount > 0 && ` · ${attentionCount} need attention`}
          </p>
        </div>

        {subscriptions.length === 0 && (
          <p className="text-muted-foreground">
            No feeds yet. Add one above, or{' '}
            <Link
              to="/settings/import"
              className="text-foreground underline underline-offset-4"
            >
              import your subscriptions
            </Link>{' '}
            from another reader.
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
    </>
  )
}
