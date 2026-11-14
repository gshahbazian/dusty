import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'

import { UnreadPage } from '../components/unread/unread-page.tsx'
import { parseFeedSearch } from '../lib/article-search.ts'
import { getArticleList } from '../server/articles.ts'

const parseFeedId = (raw: string): number => {
  const id = Number(raw)

  if (!Number.isInteger(id) || id <= 0) throw notFound()

  return id
}

/** One feed's articles, newest first: unread, or all (`?show=all`). */
export const Route = createFileRoute('/feeds/$feedId')({
  validateSearch: parseFeedSearch,
  // Switching unread / all reloads the list; opening an article doesn't.
  loaderDeps: ({ search }) => ({ show: search.show ?? 'unread' }),
  loader: ({ params, deps }) =>
    getArticleList({
      data: { feedId: parseFeedId(params.feedId), show: deps.show },
    }),
  component: FeedArticles,
})

function FeedArticles() {
  const data = Route.useLoaderData()
  const { feedId } = Route.useParams()
  const { article, show } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <UnreadPage
      data={data}
      feedId={Number(feedId)}
      listShow={{
        show: show ?? 'unread',
        // A new list: the open article (if any) closes.
        onChange: (next) =>
          void navigate({
            search: { show: next === 'all' ? 'all' : undefined },
          }),
      }}
      articleId={article ?? null}
      onOpenArticle={(id) =>
        void navigate({
          search: (prev) => ({ ...prev, article: id ?? undefined }),
        })
      }
    />
  )
}
