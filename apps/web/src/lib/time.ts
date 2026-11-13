const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
]

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** e.g. "3 days ago", "in 2 hours", "just now". */
export const relativeTime = (at: number, now: number): string => {
  const elapsed = at - now

  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) {
      return relative.format(Math.round(elapsed / size), unit)
    }
  }

  return 'just now'
}

const exact = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** e.g. "Nov 13, 2026, 9:28 AM", in the viewer's time zone. */
export const exactTime = (at: number): string => exact.format(at)

/** e.g. "3 days", for how long something has been going on. */
export const duration = (ms: number): string => {
  for (const [unit, size] of UNITS) {
    if (ms >= size) {
      const count = Math.floor(ms / size)

      return `${count} ${unit}${count === 1 ? '' : 's'}`
    }
  }

  return 'under a minute'
}
