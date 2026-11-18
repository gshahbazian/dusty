import type { Subscription } from '@dusty/db'

import { duration } from '#/lib/time'
import { compareNames } from '#/lib/names'

export type SortOrder = 'name' | 'attention' | 'latest'

export interface HealthLabel {
  readonly text: string
  readonly tone: 'good' | 'warn' | 'bad'
}

/** The badge: failing beats stale beats never synced beats healthy. */
export function healthLabel(subscription: Subscription): HealthLabel {
  if (subscription.health === 'failing') return { text: 'Failing', tone: 'bad' }

  if (subscription.lastSuccessAt === null) {
    return { text: 'Never synced', tone: 'warn' }
  }

  if (subscription.health === 'stale') return { text: 'Stale', tone: 'warn' }

  return { text: 'Healthy', tone: 'good' }
}

export interface FailureNote {
  readonly text: string
  /** Flagged failing (red), or a recent error not yet worth alarm. */
  readonly flagged: boolean
}

/**
 * Why a feed's last fetches failed, or null if the last one worked.
 *
 * - Flagged failing (no success for `FEED_FAILING_AFTER_HOURS`): "Failing
 *   for 3 days, 12 times in a row: 404 not found".
 * - A newer error is still shown, without alarm, so a brief outage does not
 *   cry wolf: "Last fetch failed: 404 not found (2 times in a row)".
 */
export function failureNote(
  subscription: Subscription,
  now: number
): FailureNote | null {
  if (subscription.firstFailureAt === null) return null

  const times = subscription.consecutiveFailures
  const error = subscription.lastError ?? 'unknown error'

  if (subscription.health === 'failing') {
    const since = duration(now - subscription.firstFailureAt)
    const inARow = times === 1 ? 'once' : `${times} times in a row`

    return { text: `Failing for ${since}, ${inARow}: ${error}`, flagged: true }
  }

  const inARow = times === 1 ? '' : ` (${times} times in a row)`

  return { text: `Last fetch failed: ${error}${inARow}`, flagged: false }
}

const ATTENTION_ORDER = { failing: 0, stale: 1, healthy: 2 } as const

const byName = (a: Subscription, b: Subscription) =>
  compareNames(a.title, b.title)

/**
 * Sort for display. `attention` puts failing, then stale, feeds first;
 * `latest` puts the feed with the newest article first, and feeds with no
 * articles yet last.
 */
export function sortSubscriptions(
  subscriptions: readonly Subscription[],
  order: SortOrder
): Subscription[] {
  if (order === 'name') return subscriptions.toSorted(byName)

  if (order === 'latest') {
    return subscriptions.toSorted(
      (a, b) =>
        (b.lastPublishedAt ?? -Infinity) - (a.lastPublishedAt ?? -Infinity) ||
        byName(a, b)
    )
  }

  return subscriptions.toSorted(
    (a, b) =>
      ATTENTION_ORDER[a.health] - ATTENTION_ORDER[b.health] || byName(a, b)
  )
}

/** Feeds that are failing or stale: the ones a cleanup pass looks at. */
export const needsAttention = (subscription: Subscription): boolean =>
  subscription.health !== 'healthy'

/**
 * The confirm button for removing a feed. Unread articles go with it, so
 * they are mentioned, but only when there are any.
 */
export function removeConfirmation(subscription: Subscription): string {
  const count = subscription.unread

  if (count === 0) return `Remove ${subscription.title}?`

  const articles = count === 1 ? 'article' : 'articles'

  return `Remove ${subscription.title} and its ${count} unread ${articles}?`
}
