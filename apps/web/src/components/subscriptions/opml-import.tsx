import { cn } from 'cn'
import { useMutation } from '@tanstack/react-query'
import { LoaderCircleIcon } from 'lucide-react'
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
      readonly entries: readonly OpmlEntry[]
      readonly done: number
    }
  | {
      readonly kind: 'finished'
      readonly added: readonly ImportedFeed[]
      readonly skipped: readonly ImportedFeed[]
      readonly failed: readonly ImportedFeed[]
    }

/** A feed in the finished import's lists, and why, unless it was added. */
interface ImportedFeed {
  readonly url: string
  readonly name: string
  readonly reason: string | null
}

const imported = (
  entry: ImportEntry,
  reason: string | null = null
): ImportedFeed => ({ url: entry.url, name: entry.title ?? entry.url, reason })

/** The server skips a feed already subscribed, or one listed twice. */
const skipReason = (result: ImportResult & { status: 'skipped' }) =>
  result.feed === null ? SKIP_REASONS.duplicate : SKIP_REASONS.subscribed

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** Entries the preview will send, and the ones it already skips (why). */
function splitPreview(entries: readonly OpmlEntry[]) {
  const toImport: ImportEntry[] = []
  const skipped: ImportedFeed[] = []

  for (const entry of entries) {
    if (entry.skip === null) {
      toImport.push({ url: entry.url, title: entry.title })
    } else {
      skipped.push(imported(entry, SKIP_REASONS[entry.skip]))
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
      const { toImport, skipped } = splitPreview(entries)
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

      return {
        added: results.flatMap((result) =>
          result.status === 'added' ? [imported(result)] : []
        ),
        skipped: [
          ...skipped,
          ...results.flatMap((result) =>
            result.status === 'skipped'
              ? [imported(result, skipReason(result))]
              : []
          ),
        ],
        failed: results.flatMap((result) =>
          result.status === 'failed' ? [imported(result, result.reason)] : []
        ),
      }
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
      return { kind: 'importing', entries: runImport.variables, done }
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
    <div className="flex flex-col gap-4">
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
    </div>
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

  if (step.kind === 'finished') {
    return (
      <div className="flex flex-col gap-6">
        <ResultList title="Added" feeds={step.added} />
        <ResultList title="Skipped" feeds={step.skipped} />
        <ResultList title="Failed" feeds={step.failed} />
      </div>
    )
  }

  // Importing looks just like the preview: only the button and its
  // progress change, so a quick import doesn't flash the page.
  const { toImport, skipped } = splitPreview(step.entries)
  const importing = step.kind === 'importing'

  return (
    <div className="flex flex-col gap-6">
      {toImport.length > 0 && (
        <div className="flex items-center gap-3">
          <Button disabled={importing} onClick={() => onImport(step.entries)}>
            Import {plural(toImport.length, 'feed', 'feeds')}
          </Button>
          {importing && (
            <p className="text-muted-foreground flex items-center gap-2">
              <LoaderCircleIcon
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              {step.done} of {toImport.length} imported
            </p>
          )}
        </div>
      )}
      {toImport.length === 0 && (
        <p>Nothing new to import: every feed in this file is skipped.</p>
      )}
      <ResultList
        title="To import"
        feeds={toImport.map((entry) => imported(entry))}
      />
      <ResultList title="Skipped" feeds={skipped} />
    </div>
  )
}

/** One group of an import's feeds; nothing when it is empty. */
function ResultList({
  title,
  feeds,
}: {
  title: string
  feeds: readonly ImportedFeed[]
}) {
  if (feeds.length === 0) return null

  const id = `import-${title.toLowerCase().replaceAll(' ', '-')}`

  return (
    <section aria-labelledby={id} className="flex max-w-2xl flex-col gap-1">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <ul aria-labelledby={id} className="divide-y border text-sm">
        {feeds.map((feed, index) => (
          <li key={`${feed.url}-${index}`} className="px-3 py-2 break-all">
            {feed.name}
            {feed.reason !== null && (
              <span className="text-muted-foreground">: {feed.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const SKIP_REASONS = {
  subscribed: 'already subscribed',
  'not-web': 'not a web address',
  duplicate: 'listed twice in this file',
} as const
