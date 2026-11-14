import { exactTime, relativeTime } from '../lib/time.ts'

/** A time as "3 days ago"; hovering shows the exact time. */
export function RelativeTime({
  at,
  now,
  className,
}: {
  at: number
  now: number
  className?: string
}) {
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={exactTime(at)}
      className={className}
    >
      {relativeTime(at, now)}
    </time>
  )
}
