import { cn } from 'cn'
import { useMutation } from '@tanstack/react-query'
import { useState, type ChangeEvent } from 'react'

import type { ImportEntry, ImportResult } from '@dusty/sync/contract'

import { Button, buttonVariants } from '#/components/ui/button'

import {
  IMPORT_BATCH_SIZE,
  importSubscriptions,
  previewOpml,
  type OpmlEntry,
} from '#/server/subscriptions'

type Step =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'preview'; readonly entries: readonly OpmlEntry[] }
  | {
      readonly kind: 'importing'
      readonly done: number
      readonly total: number
    }
  | {
      readonly kind: 'finished'
      readonly added: number
      readonly skipped: number
      readonly failed: readonly ImportResult[]
    }

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** Entries the preview will send, and how many it already skips. */
function splitPreview(entries: readonly OpmlEntry[]) {
  const toImport: ImportEntry[] = []
  let skipped = 0

  for (const entry of entries) {
    if (entry.skip === null) {
      toImport.push({ url: entry.url, title: entry.title })
    } else {
      skipped += 1
    }
  }

  return { toImport, skipped }
}

const chunk = <T,>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size)
  )

/**
 * Import subscriptions from another reader's OPML export. Feeds already
 * subscribed are skipped, and imported feeds' current articles arrive read,
 * so the unread list is not flooded.
 */
export function OpmlImport({ onImported }: { onImported: () => void }) {
  const preview = useMutation({
    mutationFn: async (file: File) =>
      previewOpml({ data: { opml: await file.text() } }),
  })

  // "Importing… 3 of 12": progress inside one import, only ever shown.
  const [done, setDone] = useState(0)

  const runImport = useMutation({
    mutationFn: async (entries: readonly OpmlEntry[]) => {
      const { toImport, skipped: skippedBefore } = splitPreview(entries)
      const results: ImportResult[] = []

      setDone(0)

      for (const batch of chunk(toImport, IMPORT_BATCH_SIZE)) {
        try {
          results.push(
            ...(await importSubscriptions({ data: { entries: batch } }))
          )
        } catch {
          // What was imported so far stays; choosing the file again skips it.
          throw new Error(
            `it stopped after ${results.length} of ${toImport.length} feeds; choose the file again to import the rest`
          )
        }

        setDone(results.length)
      }

      const failed = results.filter((result) => result.status === 'failed')
      const added = results.filter((result) => result.status === 'added').length
      const skipped = skippedBefore + results.length - added - failed.length

      return { added, skipped, failed }
    },
    onSettled: onImported,
  })

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    // Reset, so choosing the same file again fires a change.
    event.target.value = ''

    if (file === undefined) return

    runImport.reset()
    preview.mutate(file)
  }

  /** Where the import is, from the two steps' states. */
  const stepNow = (): Step => {
    if (runImport.isPending) {
      const total = splitPreview(runImport.variables).toImport.length

      return { kind: 'importing', done, total }
    }

    if (runImport.isError) {
      return { kind: 'invalid', reason: runImport.error.message }
    }

    if (runImport.data !== undefined) {
      return { kind: 'finished', ...runImport.data }
    }

    if (preview.isPending) return { kind: 'reading' }

    if (preview.isError) {
      return { kind: 'invalid', reason: "couldn't read that file" }
    }

    if (preview.data === undefined) return { kind: 'idle' }

    if (preview.data.status === 'invalid') {
      return { kind: 'invalid', reason: preview.data.reason }
    }

    return { kind: 'preview', entries: preview.data.entries }
  }

  const step = stepNow()

  return (
    <section className="flex flex-col gap-2" aria-labelledby="import-heading">
      <h2 id="import-heading" className="text-xs font-medium">
        Import from another reader
      </h2>
      {/* A label styled as a button, so the hidden file input opens on click. */}
      <label
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'w-fit cursor-pointer has-[:focus-visible]:border-ring has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50'
        )}
      >
        Choose an OPML file
        <input
          type="file"
          accept=".opml,.xml,text/xml,application/xml,text/x-opml"
          className="sr-only"
          onChange={choose}
          disabled={step.kind === 'reading' || step.kind === 'importing'}
        />
      </label>
      <output className="block text-xs" aria-live="polite">
        <ImportStatus
          step={step}
          onImport={(entries) => runImport.mutate(entries)}
        />
      </output>
    </section>
  )
}

function ImportStatus({
  step,
  onImport,
}: {
  step: Step
  onImport: (entries: readonly OpmlEntry[]) => void
}) {
  if (step.kind === 'idle') return null

  if (step.kind === 'reading') return <p>Reading the file…</p>

  if (step.kind === 'invalid') {
    return <p className="text-destructive">Couldn't import: {step.reason}.</p>
  }

  if (step.kind === 'importing') {
    return (
      <p>
        Importing… {step.done} of {step.total}
      </p>
    )
  }

  if (step.kind === 'finished') {
    return (
      <div>
        <p>
          Import finished: {step.added} added, {step.skipped} skipped,{' '}
          {step.failed.length} failed.
        </p>
        {step.failed.length > 0 && (
          <p className="text-muted-foreground mt-1">
            Feeds that failed were added anyway; they show their error below
            until a sync gets through.
          </p>
        )}
        {step.failed.length > 0 && (
          <ul className="text-muted-foreground mt-1 list-disc pl-5">
            {step.failed.map((result) => (
              <li key={result.url}>
                {result.title ?? result.url}:{' '}
                {result.status === 'failed' && result.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const { toImport, skipped } = splitPreview(step.entries)
  const skippedEntries = step.entries.filter((entry) => entry.skip !== null)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p>
        {plural(toImport.length, 'feed', 'feeds')} to import
        {skipped > 0 && `, ${skipped} already subscribed or listed twice`}.
      </p>
      {toImport.length > 0 && (
        <Button onClick={() => onImport(step.entries)}>
          Import {plural(toImport.length, 'feed', 'feeds')}
        </Button>
      )}
      {skippedEntries.length > 0 && (
        <details className="text-muted-foreground w-full">
          <summary className="cursor-pointer">
            Show the{' '}
            {plural(skippedEntries.length, 'skipped feed', 'skipped feeds')}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {skippedEntries.map((entry, index) => (
              <li key={`${entry.url}-${index}`} className="break-all">
                {entry.title ?? entry.url}:{' '}
                {SKIP_REASONS[entry.skip ?? 'duplicate']}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

const SKIP_REASONS = {
  subscribed: 'already subscribed',
  duplicate: 'listed twice in this file',
} as const
