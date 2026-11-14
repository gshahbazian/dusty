import { cn } from 'cn'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

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
  // Which of the row's own forms is open: local UI, nothing else needs it.
  const [renaming, setRenaming] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const remove = useMutation({
    mutationFn: () => removeSubscription({ data: { id: subscription.id } }),
    onSuccess: onChanged,
  })

  const label = healthLabel(subscription)
  const failure = failureNote(subscription, now)
  const untitled = subscription.title === subscription.url

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
              <RelativeTime at={subscription.lastPublishedAt} now={now} />
            )}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Last synced:</dt>
          <dd>
            {subscription.lastSuccessAt === null && 'never'}
            {subscription.lastSuccessAt !== null && (
              <RelativeTime at={subscription.lastSuccessAt} now={now} />
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
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
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
  const rename = useMutation({
    mutationFn: (title: string) =>
      renameSubscription({ data: { id: subscription.id, title } }),
    onSuccess: () => onDone(true),
  })

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const field = event.currentTarget.elements.namedItem('title')

    if (field instanceof HTMLInputElement) rename.mutate(field.value)
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <Label className="sr-only" htmlFor={`rename-${subscription.id}`}>
        New name for {subscription.title}
      </Label>
      {/* Opening the form is asking to type a name: the cursor goes there,
          with the current name selected. */}
      <Input
        id={`rename-${subscription.id}`}
        name="title"
        defaultValue={subscription.customTitle ?? ''}
        // The owner just pressed Rename: focus belongs here, not on load.
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        placeholder={subscription.feedTitle ?? subscription.url}
        className="w-64"
      />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={rename.isPending}
      >
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
