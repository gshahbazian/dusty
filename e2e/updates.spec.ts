import { expect, test } from '@playwright/test'

import { DEV_SYNC_PORT } from '~/infra/dev'

import {
  articleRow,
  FEEDS,
  feedFor,
  heading,
  openArticle,
  subscribe,
  subscriptionRow,
  unsubscribe,
} from '~/e2e/helpers'

/** Show updates: an update to a read article brings it back as unread. */
test('with Show updates on, an updated article comes back unread, marked Updated', async ({
  page,
  request,
}) => {
  test.slow()

  const feed = feedFor('updates')
  const feedId = await subscribe(page, feed)

  // Turn it on for this feed; it stays on after a reload.
  const showUpdates = subscriptionRow(page, feed).getByRole('switch', {
    name: 'Show updates',
  })

  await expect(showUpdates).not.toBeChecked()
  await showUpdates.click()
  await expect(showUpdates).toBeChecked()
  await page.reload()
  await expect(showUpdates).toBeChecked()

  // Read the oldest article.
  await page.goto(`/feeds/${feedId}`)
  await articleRow(page, 'Generated 1')
    .getByRole('button', { name: 'Mark Generated 1 read' })
    .click()
  await expect(articleRow(page, 'Generated 1')).toContainText('(read)')

  // Its author adds an update; a sync brings it back.
  await request.get(`${FEEDS}/generated/update?run=${feed.id}&n=1`)
  await expect(async () => {
    await request.get(
      `http://localhost:${DEV_SYNC_PORT}/cdn-cgi/handler/scheduled?cron=17+*+*+*+*`
    )
    await page.goto(`/feeds/${feedId}`)
    await expect(heading(page)).toContainText('3 unread', { timeout: 1000 })
  }).toPass({ timeout: 20_000 })

  const row = articleRow(page, 'Generated 1')

  await expect(row).not.toContainText('(read)')
  await expect(row).toContainText('Updated')
  await expect(articleRow(page, 'Generated 2')).not.toContainText('Updated')

  // The article shows the update and when it came.
  await openArticle(page, 'Generated 1')
  await expect(page.getByRole('article', { name: 'Article' })).toContainText(
    'Update (2026-01-02): More about item 1, added later.'
  )
  await expect(page.getByRole('article', { name: 'Article' })).toContainText(
    '· Updated'
  )

  await unsubscribe(page, feed)
})
