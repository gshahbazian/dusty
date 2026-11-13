import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import type { SortOrder } from './health.ts'

/** `?sort=name&attention=true`; both optional, so links need neither. */
export type SubscriptionsSearch = {
  readonly sort?: SortOrder | undefined
  readonly attention?: boolean | undefined
}

const decodeSort = Schema.decodeUnknownOption(
  Schema.Literals(['attention', 'name', 'unread'])
)

const decodeAttention = Schema.decodeUnknownOption(Schema.Boolean)

/**
 * Read the subscriptions page's search params. A bad value falls back to
 * its default instead of failing, and only that key falls back.
 *
 * Both keys are always returned, `undefined` when missing or bad: TanStack
 * Router spreads the validator's result over the raw query
 * (`{ ...raw, ...validated }`), so a key left out keeps its raw value.
 */
export const parseSubscriptionsSearch = (search: {
  readonly sort?: unknown
  readonly attention?: unknown
}): SubscriptionsSearch => ({
  sort: Option.getOrUndefined(decodeSort(search.sort)),
  attention: Option.getOrUndefined(decodeAttention(search.attention)),
})
