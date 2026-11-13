import { describe, expect, test } from 'vitest'

import { parseSubscriptionsSearch } from '../src/components/subscriptions/search.ts'

describe('parseSubscriptionsSearch', () => {
  test('keeps good values', () => {
    expect(parseSubscriptionsSearch({ sort: 'name', attention: true })).toEqual(
      { sort: 'name', attention: true }
    )
  })

  test('a bad value falls back on its own, leaving good ones', () => {
    expect(
      parseSubscriptionsSearch({ sort: 'bogus', attention: true })
    ).toEqual({ sort: undefined, attention: true })
    expect(
      parseSubscriptionsSearch({ sort: 'unread', attention: 'maybe' })
    ).toEqual({ sort: 'unread', attention: undefined })
  })

  // The router spreads this over the raw query, so a key that is left out
  // would let the raw junk through.
  test('always returns both keys, so junk in the URL is overridden', () => {
    const search = parseSubscriptionsSearch({ sort: 'bogus', attention: 'yes' })

    expect(Object.keys(search).toSorted()).toEqual(['attention', 'sort'])
    expect({ sort: 'bogus', attention: 'yes', ...search }).toEqual({
      sort: undefined,
      attention: undefined,
    })
  })

  test('missing values stay missing', () => {
    expect(parseSubscriptionsSearch({})).toEqual({
      sort: undefined,
      attention: undefined,
    })
  })
})
