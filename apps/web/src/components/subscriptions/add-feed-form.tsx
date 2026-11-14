import { cn } from 'cn'
import { useMutation } from '@tanstack/react-query'
import type { FormEvent } from 'react'

import type { AddFeedResult } from '@dusty/sync/contract'

import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'

import { addSubscription } from '../../server/subscriptions.ts'

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
  const add = useMutation({
    mutationFn: (url: string) => addSubscription({ data: { url } }),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const form = event.currentTarget
    const field = form.elements.namedItem('url')
    const url = field instanceof HTMLInputElement ? field.value.trim() : ''

    if (url === '') return

    add.mutate(url, {
      onSuccess: (result) => {
        if (result.status !== 'added') return

        form.reset()
        onAdded(result.feed.id)
      },
    })
  }

  const result = add.data
  const existingId = result?.status === 'exists' ? result.feed.id : null

  return (
    <form onSubmit={submit} className="group flex flex-col gap-2">
      <Label htmlFor="add-feed-url">Add a feed</Label>
      <div className="flex gap-2">
        <Input
          id="add-feed-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          name="url"
          required
          placeholder="Feed or website address"
          disabled={add.isPending}
          className="flex-1"
        />
        {/* Dimmed while the field is empty (submitting it empty is refused
            by the browser, as the field is required). */}
        <Button
          type="submit"
          disabled={add.isPending}
          className="group-has-[input:placeholder-shown]:opacity-50"
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
      <output className="block min-h-5 text-xs" aria-live="polite">
        {result !== undefined && (
          <>
            <span
              className={cn(
                result.status === 'invalid' && 'text-destructive',
                result.status !== 'invalid' && 'text-muted-foreground'
              )}
            >
              {resultMessage(result)}
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
        {add.isError && (
          <span className="text-destructive">
            Something went wrong. Please try again.
          </span>
        )}
      </output>
    </form>
  )
}
