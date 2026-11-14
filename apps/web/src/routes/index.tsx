import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { UnreadPage } from '#/components/unread/unread-page'
import { parseArticleSearch } from '#/lib/article-search'
import { getArticleList } from '#/server/articles'

/** Every unread article, oldest first: the daily triage pass. */
export const Route = createFileRoute('/')({
  validateSearch: parseArticleSearch,
  // Opening an article changes the search, not the list: no reload.
  loaderDeps: () => ({}),
  loader: () => getArticleList({ data: { feedId: null, show: 'unread' } }),
  component: AllUnread,
})

function AllUnread() {
  const data = Route.useLoaderData()
  const { article } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <UnreadPage
      data={data}
      feedId={null}
      articleId={article ?? null}
      onOpenArticle={(id) =>
        void navigate({ search: { article: id ?? undefined } })
      }
    />
  )
}
