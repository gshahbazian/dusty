import { useEffect, useState } from 'react'

import type { Article } from '@dusty/db'

import { exactTime } from '../../lib/time.ts'
import { getArticleToRead } from '../../server/articles.ts'
import { prepareArticleHtml } from './article-html.ts'

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly article: Article }

/**
 * One article, for reading. Its HTML was cleaned with a strict allowlist
 * when it was stored, and the page's Content Security Policy would stop any
 * script that slipped through anyway.
 */
export function ArticleView({
  articleId,
  read,
  onOpened,
  onMarkUnread,
  onClose,
}: {
  articleId: number
  read: boolean
  onOpened: (id: number) => void
  onMarkUnread: (id: number) => void
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })

  useEffect(() => {
    let current = true

    setLoaded({ kind: 'loading' })
    getArticleToRead({ data: { id: articleId } }).then(
      (article) => {
        if (!current) return

        if (article === null) {
          setLoaded({ kind: 'missing' })

          return
        }

        setLoaded({ kind: 'ready', article })

        if (article.readAt === null) onOpened(article.id)
      },
      () => {
        if (current) setLoaded({ kind: 'error' })
      }
    )

    return () => {
      current = false
    }
    // Load once per article; `onOpened` changes identity every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId])

  return (
    <article
      aria-label="Article"
      className="fixed inset-0 z-20 overflow-y-auto bg-white p-4 xl:sticky xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:rounded-lg xl:border xl:border-neutral-200 dark:bg-neutral-950 xl:dark:border-neutral-800"
    >
      <div className="mx-auto max-w-2xl xl:max-w-none">
        <ArticleActions
          read={read}
          onClose={onClose}
          onMarkUnread={() => onMarkUnread(articleId)}
        />
        <ArticleBody loaded={loaded} />
      </div>
    </article>
  )
}

function ArticleActions({
  read,
  onClose,
  onMarkUnread,
}: {
  read: boolean
  onClose: () => void
  onMarkUnread: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        ← Back to the list
      </button>
      {read && (
        <button
          type="button"
          onClick={onMarkUnread}
          className="ml-auto rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Mark unread
        </button>
      )}
    </div>
  )
}

function ArticleBody({ loaded }: { loaded: Loaded }) {
  if (loaded.kind === 'loading') {
    return <p className="text-neutral-500">Loading…</p>
  }

  if (loaded.kind === 'missing') {
    return <p className="text-neutral-500">This article is no longer here.</p>
  }

  if (loaded.kind === 'error') {
    return (
      <p className="text-red-600 dark:text-red-400">
        Couldn't load the article. Please try again.
      </p>
    )
  }

  const { article } = loaded

  return (
    <>
      <header className="mb-4">
        <p className="text-sm text-neutral-500">{article.feedTitle}</p>
        <h2 className="text-2xl leading-tight font-semibold break-words">
          {article.title ?? 'Untitled'}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {article.author !== null && `${article.author} · `}
          <time dateTime={new Date(article.publishedAt).toISOString()}>
            {exactTime(article.publishedAt)}
          </time>
        </p>
        {article.url !== null && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm underline"
          >
            Open the original
          </a>
        )}
      </header>
      {article.html !== null && (
        <div
          className="article-body"
          // The HTML was cleaned with a strict allowlist when it was stored
          // (apps/sync/src/clean.ts), and the CSP blocks scripts regardless.
          // oxlint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: prepareArticleHtml(article.html) }}
        />
      )}
      {article.html === null && (
        <p className="text-neutral-600 dark:text-neutral-400">
          {article.excerpt ?? 'This article has no content in its feed.'}{' '}
          {article.url !== null && 'Open the original to read it.'}
        </p>
      )}
    </>
  )
}
