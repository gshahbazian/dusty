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
      readonly added: readonly string[]
      readonly skipped: readonly string[]
      readonly failed: readonly string[]
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
      const { toImport } = splitPreview(entries)
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

      const names = (status: ImportResult['status']) =>
        results.flatMap((result) =>
          result.status === status ? [result.title ?? result.url] : []
        )

      const skipped = [
        ...entries.flatMap((entry) =>
          entry.skip === null ? [] : [entry.title ?? entry.url]
        ),
        ...names('skipped'),
      ]

      return { added: names('added'), skipped, failed: names('failed') }
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
    <section
      className="flex flex-col gap-4"
      aria-label="Import from another reader"
    >
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
        Importing… {step.done} of {step.total}. Keep this page open until it
        finishes (closing it stops the rest; importing again skips what's done).
      </p>
    )
  }

  if (step.kind === 'finished') {
    return (
      <div className="flex flex-col gap-6">
        <ResultTable title="Added" names={step.added} />
        <ResultTable title="Skipped" names={step.skipped} />
        <ResultTable title="Failed" names={step.failed} />
      </div>
    )
  }

  const { toImport, skipped } = splitPreview(step.entries)
  const skippedEntries = step.entries.filter((entry) => entry.skip !== null)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p>
        {plural(toImport.length, 'feed', 'feeds')} to import
        {skipped > 0 && `, ${skipped} skipped`}.
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

/** One group of the finished import's feeds; nothing when it is empty. */
function ResultTable({
  title,
  names,
}: {
  title: string
  names: readonly string[]
}) {
  if (names.length === 0) return null

  return (
    <table className="w-full max-w-2xl text-sm">
      <caption className="pb-1 text-left font-semibold">{title}</caption>
      <tbody>
        {names.map((name, index) => (
          <tr key={`${name}-${index}`} className="border">
            <td className="px-3 py-2 break-all">{name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const SKIP_REASONS = {
  subscribed: 'already subscribed',
  'not-web': 'not a web address',
  duplicate: 'listed twice in this file',
} as const
