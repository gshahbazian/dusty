import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { DEV_FEEDS_PORT, DEV_SYNC_PORT } from '../infra/dev.ts'

/**
 * Helpers for tests against the running dev stack and its fixture feed
 * server. The feed server's /generated.xml?run=<id> starts with three items
 * (or `count`), and /generated/add adds a newer one, so a test can land a
 * sync mid-test. Each test uses its own feed, and removes it at the end.
 */
const run = Date.now().toString(36)

export const FEEDS = `http://localhost:${DEV_FEEDS_PORT}`

/**
 * Refresh waits for the sync, which can run for up to its 25 s budget when
 * it isn't skipped as recent (other specs add big feeds in parallel).
 */
export const AFTER_REFRESH = { timeout: 30_000 }

/** Each test gets its own generated feed: tests run in parallel. */
export const feedFor = (name: string, count = 3) => {
  const id = `${run}-${name}`
  const countParam = count === 3 ? '' : `&count=${count}`

  return { id, count, url: `${FEEDS}/generated.xml?run=${id}${countParam}` }
}

export type Feed = ReturnType<typeof feedFor>

export const articleList = (page: Page) =>
  page.getByRole('list', { name: 'Unread articles' })

/** A row, found by its exact title. */
export const articleRow = (page: Page, title: string) =>
  articleList(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })

/** Open a row's article (its title and excerpt are one button). */
export const openArticle = (page: Page, title: string) =>
  articleRow(page, title).getByRole('button').first().click()

export const heading = (page: Page) => page.getByRole('heading', { level: 1 })

const subscriptionRow = (page: Page, feed: Feed) =>
  page
    .getByRole('list', { name: 'Subscriptions' })
    .getByRole('listitem')
    .filter({ has: page.getByText(feed.url, { exact: true }) })

/** Subscribe to a generated feed; returns its id. */
export const subscribe = async (page: Page, feed: Feed): Promise<string> => {
  await page.goto('/settings')
  await page.getByLabel('Add a feed').fill(feed.url)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(
    page.getByText(`Added Generated ${feed.id} with ${feed.count} articles.`)
  ).toBeVisible({ timeout: 30_000 })

  const id = (await subscriptionRow(page, feed).getAttribute('id'))?.replace(
    'feed-',
    ''
  )

  if (id === undefined) throw new Error('no feed id on the row')

  return id
}

export const unsubscribe = async (page: Page, feed: Feed) => {
  await page.goto('/settings')

  const row = subscriptionRow(page, feed)

  await row.getByRole('button', { name: /^Remove / }).click()
  await row.getByRole('button', { name: /^Remove .*\?$/ }).click()
  await expect(row).toHaveCount(0)
}

/**
 * Add a newer article to the feed and sync until a fresh page shows it,
 * without touching `page` (the one loaded before the sync).
 */
export const landNewArticle = async (
  page: Page,
  request: APIRequestContext,
  feed: Feed,
  feedId: string,
  title: string
) => {
  await request.get(`${FEEDS}/generated/add?run=${feed.id}`)

  const other = await page.context().newPage()

  await expect(async () => {
    await request.get(
      `http://localhost:${DEV_SYNC_PORT}/cdn-cgi/handler/scheduled?cron=17+*+*+*+*`
    )
    await other.goto(`/feeds/${feedId}`)
    await expect(articleRow(other, title)).toHaveCount(1, { timeout: 1000 })
  }).toPass({ timeout: 20_000 })
  await other.close()
}
