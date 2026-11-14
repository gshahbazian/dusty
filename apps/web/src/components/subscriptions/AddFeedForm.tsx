import { useState, type FormEvent } from 'react'

import type { AddFeedResult } from '@dusty/sync/contract'

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
      <label htmlFor="add-feed-url" className="text-sm font-medium">
        Add a feed
      </label>
      <div className="flex gap-2">
        <input
          id="add-feed-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Feed or website address"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={adding}
          className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={adding || url.trim() === ''}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      <output className="block min-h-5 text-sm" aria-live="polite">
        {status.kind === 'done' && (
          <>
            <span
              className={
                isRefusal(status)
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-neutral-600 dark:text-neutral-400'
              }
            >
              {resultMessage(status.result)}
            </span>{' '}
            {existingId !== null && (
              <button
                type="button"
                className="underline"
                onClick={() => onShowExisting(existingId)}
              >
                Show it
              </button>
            )}
          </>
        )}
        {status.kind === 'error' && (
          <span className="text-red-600 dark:text-red-400">
            Something went wrong. Please try again.
          </span>
        )}
      </output>
    </form>
  )
}
