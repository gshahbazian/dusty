import { cn } from 'cn'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { Subscription } from '@dusty/db'

import {
  removeSubscription,
  renameSubscription,
} from '../../server/subscriptions.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'

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
        'flex flex-col gap-1 border-b py-3 transition-colors',
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
        <Badge
          variant="outline"
          className={cn(
            label.tone === 'good' && 'text-green-700 dark:text-green-400',
            label.tone === 'warn' && 'text-amber-700 dark:text-amber-400',
            label.tone === 'bad' && 'border-destructive/40 text-destructive'
          )}
        >
          {label.text}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {subscription.unread} unread
        </span>
      </div>

      {!untitled && (
        <p className="text-muted-foreground text-xs break-all">
          {subscription.url}
        </p>
      )}

      {subscription.customTitle !== null && subscription.feedTitle !== null && (
        <p className="text-muted-foreground text-xs">
          The feed calls itself {subscription.feedTitle}
        </p>
      )}

      <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
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
            'text-xs',
            failure.flagged && 'text-destructive',
            !failure.flagged && 'text-muted-foreground'
          )}
        >
          {failure.text}
        </p>
      )}

      <div className="-ml-2 flex flex-wrap items-center gap-1">
        {!renaming && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${subscription.title}`}
          >
            Rename
          </Button>
        )}
        {!confirmingRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setConfirmingRemove(true)}
            aria-label={`Remove ${subscription.title}`}
          >
            Remove
          </Button>
        )}
        {confirmingRemove && (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={remove}
            >
              {removeConfirmation(subscription)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setConfirmingRemove(false)}
            >
              Keep it
            </Button>
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
      <Label className="sr-only" htmlFor={`rename-${subscription.id}`}>
        New name for {subscription.title}
      </Label>
      <Input
        ref={input}
        id={`rename-${subscription.id}`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={subscription.feedTitle ?? subscription.url}
        className="w-64"
      />
      <Button type="submit" variant="outline" size="sm">
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => onDone(false)}
      >
        Cancel
      </Button>
    </form>
  )
}
