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
  onPrevious,
  onNext,
  onClose,
}: {
  articleId: number
  read: boolean
  /** Loaded: the page marks it read, or notes that it already was. */
  onOpened: (id: number, alreadyRead: boolean) => void
  onMarkUnread: (id: number) => void
  /** The previous and next article in the list (null at either end). */
  onPrevious: (() => void) | null
  onNext: (() => void) | null
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

        onOpened(article.id, article.readAt !== null)
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
    // Room at the bottom on a phone, where the action bar sits.
    <article aria-label="Article" className="p-4 pb-28 lg:pb-4">
      <div className="mx-auto max-w-2xl">
        <ArticleActions
          read={read}
          onClose={onClose}
          onMarkUnread={() => onMarkUnread(articleId)}
          onPrevious={onPrevious}
          onNext={onNext}
        />
        <ArticleBody loaded={loaded} />
      </div>
    </article>
  )
}

/**
 * The article's actions. On a phone they sit in a bar at the bottom of the
 * screen, within thumb reach (clear of the home indicator); wider, at the
 * top of the article. Previous and Next are the touch version of `K` / `J`.
 */
function ArticleActions({
  read,
  onClose,
  onMarkUnread,
  onPrevious,
  onNext,
}: {
  read: boolean
  onClose: () => void
  onMarkUnread: () => void
  onPrevious: (() => void) | null
  onNext: (() => void) | null
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-1 border-t border-neutral-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:static lg:mb-4 lg:border-0 lg:bg-transparent lg:p-0 dark:border-neutral-800 dark:bg-neutral-950 lg:dark:bg-transparent">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
      >
        ← Back to the list
      </button>
      <button
        type="button"
        onClick={onPrevious ?? undefined}
        disabled={onPrevious === null}
        aria-label="Previous article"
        className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={onNext ?? undefined}
        disabled={onNext === null}
        aria-label="Next article"
        className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
      >
        Next
      </button>
      {read && (
        <button
          type="button"
          onClick={onMarkUnread}
          className="ml-auto rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 pointer-coarse:min-h-11"
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
            className="mt-2 inline-flex items-center text-sm underline pointer-coarse:min-h-11"
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
