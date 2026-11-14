import { cn } from 'cn'
import { useState, type FormEvent } from 'react'

import type { AddFeedResult } from '@dusty/sync/contract'

import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'

import { addSubscription } from '../../server/subscriptions.ts'

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'adding' }
  | { readonly kind: 'done'; readonly result: AddFeedResult }
  | { readonly kind: 'error' }

/** What to say after an add, in plain words. */
function resultMessage(result: AddFeedResult): string {
  if (result.status === 'added') {
    const count = result.itemsNew
    const articles = count === 1 ? '1 article' : `${count} articles`

    return `Added ${result.feed.title} with ${articles}.`
  }

  if (result.status === 'exists') {
    return `Already subscribed as ${result.feed.title}.`
  }

  return `Couldn't add that: ${result.reason}.`
}

/** The existing subscription an add pointed at, if it did. */
function existingFeedId(status: Status): number | null {
  if (status.kind !== 'done') return null

  if (status.result.status !== 'exists') return null

  return status.result.feed.id
}

/** Whether the message is a refusal, shown as an error. */
function isRefusal(status: Status): boolean {
  return status.kind === 'done' && status.result.status === 'invalid'
}

/**
 * Paste a feed URL, or a site's home page, to subscribe. The feed is
 * checked, its title shown, and its articles pulled straight away.
 */
export function AddFeedForm({
  onAdded,
  onShowExisting,
}: {
  onAdded: (feedId: number) => void
  onShowExisting: (feedId: number) => void
}) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (url.trim() === '') return

    setStatus({ kind: 'adding' })

    try {
      const result = await addSubscription({ data: { url } })

      setStatus({ kind: 'done', result })

      if (result.status === 'added') {
        setUrl('')
        onAdded(result.feed.id)
      }
    } catch {
      setStatus({ kind: 'error' })
    }
  }

  const adding = status.kind === 'adding'
  const existingId = existingFeedId(status)

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="add-feed-url">Add a feed</Label>
      <div className="flex gap-2">
        <Input
          id="add-feed-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Feed or website address"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={adding}
          className="flex-1"
        />
        <Button type="submit" disabled={adding || url.trim() === ''}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>
      <output className="block min-h-5 text-xs" aria-live="polite">
        {status.kind === 'done' && (
          <>
            <span
              className={cn(
                isRefusal(status) && 'text-destructive',
                !isRefusal(status) && 'text-muted-foreground'
              )}
            >
              {resultMessage(status.result)}
            </span>{' '}
            {existingId !== null && (
              <Button
                variant="link"
                size="xs"
                className="px-0"
                onClick={() => onShowExisting(existingId)}
              >
                Show it
              </Button>
            )}
          </>
        )}
        {status.kind === 'error' && (
          <span className="text-destructive">
            Something went wrong. Please try again.
          </span>
        )}
      </output>
    </form>
  )
}
