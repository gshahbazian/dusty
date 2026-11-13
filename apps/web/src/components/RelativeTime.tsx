import { useState } from 'react'

import { exactTime, relativeTime } from '../lib/time.ts'

/**
 * A time as "3 days ago". Hovering shows the exact time; tapping (or
 * clicking) swaps between the two, since phones have no hover.
 */
export function RelativeTime({
  at,
  now,
  label,
}: {
  at: number
  now: number
  /** What the time is, for screen readers, e.g. "Last synced". */
  label: string
}) {
  const [showExact, setShowExact] = useState(false)
  const exact = exactTime(at)
  const shown = showExact ? exact : relativeTime(at, now)

  return (
    <button
      type="button"
      onClick={() => setShowExact((shown) => !shown)}
      className="cursor-pointer underline decoration-neutral-300 decoration-dotted underline-offset-2 dark:decoration-neutral-600"
      title={exact}
      aria-label={`${label}: ${shown}. Show ${showExact ? 'relative' : 'exact'} time`}
    >
      <time dateTime={new Date(at).toISOString()}>{shown}</time>
    </button>
  )
}
