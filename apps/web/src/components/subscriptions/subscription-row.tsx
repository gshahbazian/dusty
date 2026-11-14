import { cn } from 'cn'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { Subscription } from '@dusty/db'

import {
  removeSubscription,
  renameSubscription,
} from '../../server/subscriptions.ts'
import { RelativeTime } from '../relative-time.tsx'
import { failureNote, healthLabel, removeConfirmation } from './health.ts'

/** One subscription: its name, unread count, health and actions. */
export function SubscriptionRow({
  subscription,
  now,
  highlighted,
  onChanged,
}: {
  subscription: Subscription
  now: number
  highlighted: boolean
  onChanged: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [busy, setBusy] = useState(false)

  const label = healthLabel(subscription)
  const failure = failureNote(subscription, now)
  const untitled = subscription.title === subscription.url

  const remove = async () => {
    setBusy(true)
    await removeSubscription({ data: { id: subscription.id } })
    onChanged()
  }

  return (
    <li
      id={`feed-${subscription.id}`}
      className={cn(
        'flex flex-col gap-1 border-b border-neutral-200 py-3 transition-colors dark:border-neutral-800',
        highlighted && 'bg-yellow-50 dark:bg-yellow-950/40'
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {renaming && (
          <RenameForm
            subscription={subscription}
            onDone={(changed) => {
              setRenaming(false)

              if (changed) onChanged()
            }}
          />
        )}
        {!renaming && (
          <h3 className="font-medium break-words">{subscription.title}</h3>
        )}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            label.tone === 'good' &&
              'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
            label.tone === 'warn' &&
              'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
            label.tone === 'bad' &&
              'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
          )}
        >
          {label.text}
        </span>
        <span className="text-sm text-neutral-500">
          {subscription.unread} unread
        </span>
      </div>

      {!untitled && (
        <p className="text-xs break-all text-neutral-500">{subscription.url}</p>
      )}

      {subscription.customTitle !== null && subscription.feedTitle !== null && (
        <p className="text-xs text-neutral-500">
          The feed calls itself {subscription.feedTitle}
        </p>
      )}

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <div className="flex gap-1">
          <dt>Last article:</dt>
          <dd>
            {subscription.lastPublishedAt === null && 'none yet'}
            {subscription.lastPublishedAt !== null && (
              <RelativeTime
                at={subscription.lastPublishedAt}
                now={now}
                label="Last article"
              />
            )}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Last synced:</dt>
          <dd>
            {subscription.lastSuccessAt === null && 'never'}
            {subscription.lastSuccessAt !== null && (
              <RelativeTime
                at={subscription.lastSuccessAt}
                now={now}
                label="Last synced"
              />
            )}
          </dd>
        </div>
      </dl>

      {failure !== null && (
        <p
          className={cn(
            'text-sm',
            failure.flagged && 'text-red-700 dark:text-red-400',
            !failure.flagged && 'text-neutral-600 dark:text-neutral-400'
          )}
        >
          {failure.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {!renaming && (
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${subscription.title}`}
          >
            Rename
          </button>
        )}
        {!confirmingRemove && (
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
            onClick={() => setConfirmingRemove(true)}
            aria-label={`Remove ${subscription.title}`}
          >
            Remove
          </button>
        )}
        {confirmingRemove && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded bg-red-600 px-2 py-1 text-sm font-medium text-white disabled:opacity-50 pointer-coarse:min-h-11"
            >
              {removeConfirmation(subscription)}
            </button>
            <button
              type="button"
              className="shrink-0 rounded px-2 py-1 text-sm whitespace-nowrap text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
              onClick={() => setConfirmingRemove(false)}
            >
              Keep it
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function RenameForm({
  subscription,
  onDone,
}: {
  subscription: Subscription
  onDone: (changed: boolean) => void
}) {
  const [title, setTitle] = useState(subscription.customTitle ?? '')
  const input = useRef<HTMLInputElement>(null)

  // Opening the form is asking to type a name, so put the cursor there.
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await renameSubscription({ data: { id: subscription.id, title } })
    onDone(true)
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`rename-${subscription.id}`}>
        New name for {subscription.title}
      </label>
      <input
        ref={input}
        id={`rename-${subscription.id}`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={subscription.feedTitle ?? subscription.url}
        className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
      />
      <button
        type="submit"
        className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
      >
        Save
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
        onClick={() => onDone(false)}
      >
        Cancel
      </button>
    </form>
  )
}
