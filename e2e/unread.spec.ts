import { expect, test, type Page } from '@playwright/test'

import { DEV_FEEDS_PORT, DEV_SYNC_PORT } from '../infra/dev.ts'

/**
 * Unread lists against the running dev stack and its fixture feed server.
 * The feed server's /generated.xml?run=<id> starts with three items, and
 * /generated/add adds a newer one, so a test can land a sync mid-test.
 * Each run uses its own feed, and removes it at the end.
 */
const run = Date.now().toString(36)
const FEEDS = `http://localhost:${DEV_FEEDS_PORT}`

/** Each test gets its own generated feed: tests run in parallel. */
const feedFor = (name: string) => {
  const id = `${run}-${name}`

  return { id, url: `${FEEDS}/generated.xml?run=${id}` }
}

type Feed = ReturnType<typeof feedFor>

const articleList = (page: Page) =>
  page.getByRole('list', { name: 'Unread articles' })

/** A row, found by its exact title. */
const articleRow = (page: Page, title: string) =>
  articleList(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(title, { exact: true }) })

/** Open a row's article (its title and excerpt are one button). */
const openArticle = (page: Page, title: string) =>
  articleRow(page, title).getByRole('button').first().click()

/** Subscribe to a generated feed; returns its id. */
const subscribe = async (page: Page, feed: Feed): Promise<string> => {
  await page.goto('/subscriptions')
  await page.getByLabel('Add a feed').fill(feed.url)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(
    page.getByText(`Added Generated ${feed.id} with 3 articles.`)
  ).toBeVisible()

  const row = page
    .getByRole('list', { name: 'Subscriptions' })
    .getByRole('listitem')
    .filter({ has: page.getByText(feed.url, { exact: true }) })

  const id = (await row.getAttribute('id'))?.replace('feed-', '')

  if (id === undefined) throw new Error('no feed id on the row')

  return id
}

const unsubscribe = async (page: Page, feed: Feed) => {
  await page.goto('/subscriptions')

  const row = page
    .getByRole('list', { name: 'Subscriptions' })
    .getByRole('listitem')
    .filter({ has: page.getByText(feed.url, { exact: true }) })

  await row.getByRole('button', { name: /^Remove / }).click()
  await row.getByRole('button', { name: /^Remove .*\?$/ }).click()
  await expect(row).toHaveCount(0)
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })

test('mark all above: a sync landing between load and action is never touched', async ({
  page,
  browser,
  request,
}) => {
  const feed = feedFor('above')
  const feedId = await subscribe(page, feed)

  // The owner opens the feed's list: newest first.
  await page.goto(`/feeds/${feedId}`)
  await expect(articleList(page).getByRole('listitem')).toHaveText([
    /Generated 3/,
    /Generated 2/,
    /Generated 1/,
  ])

  // A sync lands while they read: a new article, newer than everything on
  // screen, so a reloaded list would put it above the chosen row.
  await request.get(`${FEEDS}/generated/add?run=${feed.id}`)

  const other = await browser.newPage()

  await expect(async () => {
    await request.get(
      `http://localhost:${DEV_SYNC_PORT}/cdn-cgi/handler/scheduled?cron=0+*+*+*+*`
    )
    await other.goto(`/feeds/${feedId}`)
    await expect(articleRow(other, 'Generated 4')).toHaveCount(1, {
      timeout: 1000,
    })
  }).toPass({ timeout: 20_000 })
  await other.close()

  // Back on the page loaded before that sync: mark all above Generated 1.
  await articleRow(page, 'Generated 1')
    .getByRole('button', { name: 'Mark all above Generated 1 as read' })
    .click()
  await expect(page.getByText('Marked 2 articles above as read.')).toBeVisible()
  await expect(articleRow(page, 'Generated 3')).toContainText('(read)')
  await expect(articleRow(page, 'Generated 2')).toContainText('(read)')
  await expect(articleRow(page, 'Generated 1')).not.toContainText('(read)')
  await expect(heading(page)).toContainText('1 unread')

  // Undo restores exactly those two.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Undone: 2 articles unread again.')).toBeVisible()
  await expect(articleList(page)).not.toContainText('(read)')
  await expect(heading(page)).toContainText('3 unread')

  // Again, then refresh: the two are gone, and the late article is still
  // unread, though it would have sorted above the chosen row.
  await articleRow(page, 'Generated 1')
    .getByRole('button', { name: 'Mark all above Generated 1 as read' })
    .click()
  await expect(page.getByText('Marked 2 articles above as read.')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(articleList(page).getByRole('listitem')).toHaveText([
    /Generated 4/,
    /Generated 1/,
  ])
  await expect(heading(page)).toContainText('2 unread')

  await unsubscribe(page, feed)
})

test('open an article to read it; mark it unread again', async ({ page }) => {
  const feed = feedFor('open')
  const feedId = await subscribe(page, feed)

  // A wide screen, where the article opens beside the list.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('3 unread')

  const before = await articleRow(page, 'Generated 1').boundingBox()

  await openArticle(page, 'Generated 2')

  const article = page.getByRole('article', { name: 'Article' })

  await expect(
    article.getByRole('heading', { name: 'Generated 2' })
  ).toBeVisible()
  await expect(article).toContainText('Item 2 of')
  await expect(
    article.getByRole('link', { name: 'Open the original' })
  ).toHaveAttribute('href', `https://generated.example.com/${feed.id}/2`)
  await expect(page).toHaveURL(/\?article=\d+$/)

  // Opening it read it; the row stays where it is, dimmed, and no row
  // moves or changes size under the cursor.
  await expect(heading(page)).toContainText('2 unread')
  await expect(articleRow(page, 'Generated 2')).toContainText('(read)')
  expect(await articleRow(page, 'Generated 1').boundingBox()).toEqual(before)

  await article.getByRole('button', { name: 'Mark unread' }).click()
  await expect(heading(page)).toContainText('3 unread')
  await expect(articleRow(page, 'Generated 2')).not.toContainText('(read)')

  // Back to the list, which is just as it was.
  await article.getByRole('button', { name: '← Back to the list' }).click()
  await expect(page).toHaveURL(new RegExp(`/feeds/${feedId}$`))
  await expect(articleList(page).getByRole('listitem')).toHaveCount(3)

  await unsubscribe(page, feed)
})
