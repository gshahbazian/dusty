import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

/** `?article=123`: the article open beside an unread list. */
export interface ArticleSearch {
  readonly article?: number | undefined
}

const decodeArticleId = Schema.decodeUnknownOption(
  Schema.Int.check(Schema.isGreaterThan(0))
)

/**
 * Read `?article=`. The key is always returned (`undefined` when missing or
 * bad): the router spreads this over the raw query, so a key left out would
 * keep its raw value.
 */
export const parseArticleSearch = (search: {
  readonly article?: unknown
}): ArticleSearch => ({
  article: Option.getOrUndefined(decodeArticleId(search.article)),
})
