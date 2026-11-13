import { useState } from 'react'

import { exactTime, relativeTime } from '../lib/time.ts'

/**
 * A time as "3 days ago". Hovering shows the exact time; tapping (or
 * clicking) swaps between the two, since phones have no hover.
 */
export function RelativeTime({ at, now }: { at: number; now: number }) {
  const [showExact, setShowExact] = useState(false)
  const exact = exactTime(at)

  return (
    <button
      type="button"
      onClick={() => setShowExact((shown) => !shown)}
      className="cursor-pointer underline decoration-neutral-300 decoration-dotted underline-offset-2 dark:decoration-neutral-600"
      title={exact}
    >
      <time dateTime={new Date(at).toISOString()}>
        {showExact ? exact : relativeTime(at, now)}
      </time>
    </button>
  )
}
