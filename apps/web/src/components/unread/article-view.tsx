import { useEffect, useMemo, useState } from 'react'

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
  onOpened,
}: {
  articleId: number
  /** Loaded: the page marks it read, or notes that it already was. */
  onOpened: (id: number, alreadyRead: boolean) => void
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
    // Room at the bottom on a phone, where the mobile article bar sits.
    <article aria-label="Article" className="p-4 pb-28 lg:pb-4">
      <div className="mx-auto max-w-2xl">
        <ArticleBody loaded={loaded} />
      </div>
    </article>
  )
}

function ArticleBody({ loaded }: { loaded: Loaded }) {
  if (loaded.kind === 'loading') {
    return <p className="text-muted-foreground">Loading…</p>
  }

  if (loaded.kind === 'missing') {
    return (
      <p className="text-muted-foreground">This article is no longer here.</p>
    )
  }

  if (loaded.kind === 'error') {
    return (
      <p className="text-destructive">
        Couldn't load the article. Please try again.
      </p>
    )
  }

  const { article } = loaded

  return (
    <>
      <header className="mb-4">
        {/* The feed's name links to its website's home page (sync keeps
            only http(s) addresses). */}
        <p className="text-muted-foreground text-sm">
          {article.siteUrl === null && article.feedTitle}
          {article.siteUrl !== null && (
            <a
              href={article.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              {article.feedTitle}
            </a>
          )}
        </p>
        {/* The title links to the original page, when there is one. */}
        <h2 className="text-2xl leading-tight font-semibold break-words">
          {article.url === null && (article.title ?? 'Untitled')}
          {article.url !== null && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-muted-foreground/40 hover:decoration-foreground underline-offset-4 hover:underline"
            >
              {article.title ?? 'Untitled'}
            </a>
          )}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {article.author !== null && `${article.author} · `}
          <time dateTime={new Date(article.publishedAt).toISOString()}>
            {exactTime(article.publishedAt)}
          </time>
        </p>
      </header>
      {article.html !== null && <ArticleHtml html={article.html} />}
      {article.html === null && (
        <p className="text-muted-foreground">
          {article.excerpt ?? 'This article has no content in its feed.'}{' '}
          {article.url !== null && 'Open the title’s link to read it.'}
        </p>
      )}
    </>
  )
}

/**
 * The article's HTML, prepared once per article. The page re-renders on
 * every scroll of the list, and parsing a long article each time made
 * scrolling stutter.
 */
function ArticleHtml({ html }: { html: string }) {
  const prepared = useMemo(() => prepareArticleHtml(html), [html])

  return (
    <div
      className="typeset typeset-article"
      // The HTML was cleaned with a strict allowlist when it was stored
      // (apps/sync/src/clean.ts), and the CSP blocks scripts regardless.
      // oxlint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: prepared }}
    />
  )
}
