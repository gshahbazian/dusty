import { describe, expect, test } from 'vitest'

import type { Subscription } from '@dusty/db'

import {
  failureNote,
  healthLabel,
  needsAttention,
  sortSubscriptions,
} from '../src/components/subscriptions/health.ts'
import { duration, relativeTime } from '../src/lib/time.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 10, 20)

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  url: 'https://a.test/feed',
  title: 'A',
  feedTitle: 'A',
  customTitle: null,
  siteUrl: null,
  unread: 0,
  health: 'healthy',
  createdAt: NOW - 30 * DAY,
  lastPublishedAt: NOW - DAY,
  lastSuccessAt: NOW - HOUR,
  lastFetchedAt: NOW - HOUR,
  firstFailureAt: null,
  consecutiveFailures: 0,
  lastError: null,
  ...overrides,
})

describe('health label', () => {
  test.each([
    [{ health: 'failing' as const }, 'Failing'],
    [{ health: 'stale' as const, lastSuccessAt: null }, 'Never synced'],
    [{ health: 'stale' as const }, 'Stale'],
    [{}, 'Healthy'],
  ])('%o reads %s', (overrides, text) => {
    expect(healthLabel(subscription(overrides)).text).toBe(text)
  })
})

describe('failure note', () => {
  test('nothing when the last fetch worked', () => {
    expect(failureNote(subscription(), NOW)).toBeNull()
  })

  test('a flagged failure says for how long and how often', () => {
    const note = failureNote(
      subscription({
        health: 'failing',
        firstFailureAt: NOW - 3 * DAY,
        consecutiveFailures: 72,
        lastError: '404 not found',
      }),
      NOW
    )

    expect(note).toEqual({
      text: 'Failing for 3 days, 72 times in a row: 404 not found',
      flagged: true,
    })
  })

  test('a recent error is shown without alarm, so a brief outage does not cry wolf', () => {
    const note = failureNote(
      subscription({
        firstFailureAt: NOW - 2 * HOUR,
        consecutiveFailures: 2,
        lastError: '503 service unavailable',
      }),
      NOW
    )

    expect(note).toEqual({
      text: 'Last fetch failed: 503 service unavailable (2 times in a row)',
      flagged: false,
    })
  })
})

describe('sorting and filtering', () => {
  const feeds = [
    subscription({ id: 1, title: 'beta', unread: 5 }),
    subscription({ id: 2, title: 'Alpha', unread: 1, health: 'stale' }),
    subscription({ id: 3, title: 'gamma', unread: 9, health: 'failing' }),
    subscription({ id: 4, title: 'delta', unread: 0 }),
  ]

  const ids = (list: readonly Subscription[]) => list.map((feed) => feed.id)

  test('problems first: failing, then stale, then the rest by name', () => {
    expect(ids(sortSubscriptions(feeds, 'attention'))).toEqual([3, 2, 1, 4])
  })

  test('by name, ignoring case', () => {
    expect(ids(sortSubscriptions(feeds, 'name'))).toEqual([2, 1, 4, 3])
  })

  test('by unread, most first', () => {
    expect(ids(sortSubscriptions(feeds, 'unread'))).toEqual([3, 1, 2, 4])
  })

  test('needs attention means failing or stale', () => {
    expect(ids(feeds.filter(needsAttention))).toEqual([2, 3])
  })
})

describe('times', () => {
  test.each([
    [NOW - 30_000, 'just now'],
    [NOW - 5 * MINUTE, '5 minutes ago'],
    [NOW - 3 * HOUR, '3 hours ago'],
    [NOW - DAY, 'yesterday'],
    [NOW - 3 * DAY, '3 days ago'],
    [NOW - 14 * DAY, '2 weeks ago'],
  ])('%i reads %s', (at, text) => {
    expect(relativeTime(at, NOW)).toBe(text)
  })

  test.each([
    [30_000, 'under a minute'],
    [MINUTE, '1 minute'],
    [3 * DAY + HOUR, '3 days'],
  ])('a duration of %i reads %s', (ms, text) => {
    expect(duration(ms)).toBe(text)
  })
})
