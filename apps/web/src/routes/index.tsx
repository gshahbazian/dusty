import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { UnreadPage } from '../components/unread/UnreadPage.tsx'
import { parseArticleSearch } from '../lib/article-search.ts'
import { getUnreadList } from '../server/articles.ts'

/** Every unread article, oldest first: the daily triage pass. */
export const Route = createFileRoute('/')({
  validateSearch: parseArticleSearch,
  // Opening an article changes the search, not the list: no reload.
  loaderDeps: () => ({}),
  loader: () => getUnreadList({ data: { feedId: null } }),
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
