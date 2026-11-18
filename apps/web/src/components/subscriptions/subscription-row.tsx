import { cn } from 'cn'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import type { Subscription } from '@dusty/db'

import {
  removeSubscription,
  renameSubscription,
  setSubscriptionShowUpdates,
} from '#/server/subscriptions'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'

import { RelativeTime } from '#/components/relative-time'
import {
  failureNote,
  healthLabel,
  removeConfirmation,
} from '#/components/subscriptions/health'

/** One subscription: its name, health and actions. */
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
        highlighted && 'bg-primary/10'
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
          // The name links to the website's home page (sync keeps only
          // http(s) addresses), when the feed names one.
          <h3 className="font-medium break-words">
            {subscription.siteUrl === null && subscription.title}
            {subscription.siteUrl !== null && (
              <a
                href={subscription.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {subscription.title}
              </a>
            )}
          </h3>
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

      <ShowUpdatesSwitch subscription={subscription} onChanged={onChanged} />

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

/**
 * Show updates, saved as soon as it is flipped. It shows the new setting
 * at once; if saving fails, it goes back and says so.
 */
function ShowUpdatesSwitch({
  subscription,
  onChanged,
}: {
  subscription: Subscription
  onChanged: () => void
}) {
  const save = useMutation({
    mutationFn: (showUpdates: boolean) =>
      setSubscriptionShowUpdates({
        data: { id: subscription.id, showUpdates },
      }),
    onSuccess: onChanged,
  })

  const id = `show-updates-${subscription.id}`
  // The setting just chosen, until the reloaded list confirms it; the
  // stored one again if saving failed.
  const chosen = save.isError ? undefined : save.variables
  const checked = chosen ?? subscription.showUpdates

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          size="sm"
          checked={checked}
          disabled={save.isPending}
          onCheckedChange={(next) => save.mutate(next)}
          aria-describedby={`${id}-hint`}
        />
        <Label htmlFor={id} className="text-xs font-normal">
          Show updates
        </Label>
      </div>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        An article that gets more text comes back as unread.
      </p>
      {save.isError && (
        <p role="alert" className="text-destructive text-xs">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
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
        // Esc backs out, like Cancel.
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(false)
        }}
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
