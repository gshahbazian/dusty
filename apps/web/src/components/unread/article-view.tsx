import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { Article } from '@dusty/db'

import { exactTime } from '#/lib/time'
import { articleQuery } from '#/lib/queries'
import { prepareArticleHtml } from '#/components/unread/article-html'

/**
 * One article, for reading. Its HTML was cleaned with a strict allowlist
 * when it was stored, and the page's Content Security Policy would stop any
 * script that slipped through anyway. Shown from the cache when it's there
 * (going back to it, or fetched ahead for `j` / `k`).
 */
export function ArticleView({ articleId }: { articleId: number }) {
  const query = useQuery(articleQuery(articleId))

  return (
    // Room at the bottom on a phone, where the mobile article bar sits.
    <article aria-label="Article" className="p-4 pb-28 lg:pb-4">
      <div className="mx-auto max-w-2xl">
        {query.isError && (
          <p className="text-destructive">
            Couldn't load the article. Please try again.
          </p>
        )}
        {query.data === null && (
          <p className="text-muted-foreground">
            This article is no longer here.
          </p>
        )}
        {query.data && <ArticleBody article={query.data} />}
      </div>
    </article>
  )
}

function ArticleBody({ article }: { article: Article }) {
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
