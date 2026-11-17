import { describe, expect, test } from 'vitest'

import { DAY_PATTERN, localDay } from '#/lib/backdrop'

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
})
