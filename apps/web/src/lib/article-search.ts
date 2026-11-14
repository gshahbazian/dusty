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

/** A feed page's search: the open article, and `?show=all` for read ones too. */
export interface FeedSearch extends ArticleSearch {
  readonly show?: 'all' | undefined
}

const decodeShow = Schema.decodeUnknownOption(Schema.Literal('all'))

/**
 * Read a feed page's `?article=` and `?show=`. Unread is the default, so
 * only `all` is kept; anything else reads as unread. Both keys are always
 * returned, as with `parseArticleSearch`.
 */
export const parseFeedSearch = (search: {
  readonly article?: unknown
  readonly show?: unknown
}): FeedSearch => ({
  ...parseArticleSearch(search),
  show: Option.getOrUndefined(decodeShow(search.show)),
})
