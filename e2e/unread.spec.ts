import { expect, test } from '@playwright/test'

import {
  AFTER_REFRESH,
  articleList,
  articleRow,
  feedFor,
  heading,
  landNewArticle,
  openArticle,
  subscribe,
  unsubscribe,
} from './helpers.ts'

/** Unread lists, by mouse, against the running dev stack. */
test('mark all above: a sync landing between load and action is never touched', async ({
  page,
  request,
}) => {
  test.slow()

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
  await landNewArticle(page, request, feed, feedId, 'Generated 4')

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
  await expect(articleList(page).getByRole('listitem')).toHaveText(
    [/Generated 4/, /Generated 1/],
    AFTER_REFRESH
  )
  await expect(heading(page)).toContainText('2 unread')

  await unsubscribe(page, feed)
})

test('open an article to read it; mark it unread again', async ({ page }) => {
  test.slow()

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

  // Links open in a new tab; images load lazily and send no referrer.
  await expect(article.getByRole('link', { name: 'More' })).toHaveAttribute(
    'rel',
    'noopener noreferrer'
  )
  await expect(article.getByRole('img', { name: 'Picture 2' })).toHaveAttribute(
    'loading',
    'lazy'
  )
  await expect(article.getByRole('img', { name: 'Picture 2' })).toHaveAttribute(
    'referrerpolicy',
    'no-referrer'
  )

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

  // A link to an article that is already read, so not in the list: it
  // still offers Mark unread, and `m` acts on it, not the top row.
  await openArticle(page, 'Generated 3')
  await expect(heading(page)).toContainText('2 unread')

  const link = page.url()

  await page.goto(link)
  await expect(articleList(page).getByRole('listitem')).toHaveCount(2)
  await expect(
    article.getByRole('heading', { name: 'Generated 3' })
  ).toBeVisible()
  await expect(
    article.getByRole('button', { name: 'Mark unread' })
  ).toBeVisible()
  await page.keyboard.press('m')
  await expect(
    article.getByRole('button', { name: 'Mark unread' })
  ).toHaveCount(0)
  await expect(articleRow(page, 'Generated 2')).not.toContainText('(read)')

  // It isn't one of this list's rows, so the count catches up on refresh.
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(heading(page)).toContainText('3 unread', AFTER_REFRESH)

  await unsubscribe(page, feed)
})
