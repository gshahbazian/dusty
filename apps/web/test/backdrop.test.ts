import { describe, expect, test } from 'vitest'

import {
  DAY_PATTERN,
  FALLBACK_BACKDROP,
  UNSPLASH_HOME,
  localDay,
  withReferral,
} from '#/lib/backdrop'

describe('the photo of the day', () => {
  test("a day is the browser's local date", () => {
    expect(localDay(new Date(2026, 10, 16, 0, 0))).toBe('2026-11-16')
    expect(localDay(new Date(2026, 10, 16, 23, 59))).toBe('2026-11-16')
    expect(localDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  test('the server takes only that shape', () => {
    expect(DAY_PATTERN.test('2026-11-16')).toBe(true)
    expect(DAY_PATTERN.test('2026-11-16; drop')).toBe(false)
    expect(DAY_PATTERN.test('16/11/2026')).toBe(false)
  })

  test('every link back to Unsplash carries the referral tags', () => {
    expect(withReferral(UNSPLASH_HOME)).toBe(
      'https://unsplash.com/?utm_source=dusty&utm_medium=referral'
    )
    expect(withReferral('https://unsplash.com/@annie')).toBe(
      'https://unsplash.com/@annie?utm_source=dusty&utm_medium=referral'
    )
    // A link that has a query keeps it, and is tagged once.
    expect(
      withReferral('https://unsplash.com/photos/x?ref=a&utm_source=old')
    ).toBe(
      'https://unsplash.com/photos/x?ref=a&utm_source=dusty&utm_medium=referral'
    )
  })

  test('the fallback photo is hotlinked and credited like any other', () => {
    expect(new URL(FALLBACK_BACKDROP.imageUrl).hostname).toBe(
      'images.unsplash.com'
    )
    expect(FALLBACK_BACKDROP.photographerName).not.toBe('')
    expect(new URL(FALLBACK_BACKDROP.photographerUrl).hostname).toBe(
      'unsplash.com'
    )
    expect(new URL(FALLBACK_BACKDROP.photoUrl).hostname).toBe('unsplash.com')
  })
})
