import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'

import { UnreadPage } from '../components/unread/UnreadPage.tsx'
import { parseArticleSearch } from '../lib/article-search.ts'
import { getUnreadList } from '../server/articles.ts'

const parseFeedId = (raw: string): number => {
  const id = Number(raw)

  if (!Number.isInteger(id) || id <= 0) throw notFound()

  return id
}

/** One feed's unread articles, newest first. */
export const Route = createFileRoute('/feeds/$feedId')({
  validateSearch: parseArticleSearch,
  // Opening an article changes the search, not the list: no reload.
  loaderDeps: () => ({}),
  loader: ({ params }) =>
    getUnreadList({ data: { feedId: parseFeedId(params.feedId) } }),
  component: FeedUnread,
})

function FeedUnread() {
  const data = Route.useLoaderData()
  const { feedId } = Route.useParams()
  const { article } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <UnreadPage
      data={data}
      feedId={Number(feedId)}
      articleId={article ?? null}
      onOpenArticle={(id) =>
        void navigate({ search: { article: id ?? undefined } })
      }
    />
  )
}
