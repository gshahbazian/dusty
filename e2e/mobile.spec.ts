import { expect, test, type Page } from '@playwright/test'

import {
  articleList,
  articleRow,
  FEEDS,
  feedFor,
  heading,
  subscribe,
  unsubscribe,
} from './helpers.ts'

/** The app on a phone: touch, one-handed. */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
})

const article = (page: Page) => page.getByRole('article', { name: 'Article' })

const tapRow = (page: Page, title: string) =>
  articleRow(page, title).getByRole('button').first().tap()

test('reading by touch: open, next, previous, mark unread, back', async ({
  page,
}) => {
  const feed = feedFor('phone', 4)
  const feedId = await subscribe(page, feed)

  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('4 unread')

  // The article replaces the list on a phone.
  await tapRow(page, 'Generated 3')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 3')
  await expect(
    page.getByRole('complementary', { name: 'Articles' })
  ).toBeHidden()

  // Its actions sit at the bottom of the screen, within thumb reach.
  const back = page.getByRole('button', { name: '← Back to the list' })
  const box = await back.boundingBox()

  expect(box?.y ?? 0).toBeGreaterThan(844 - 80)

  // Next and Previous read through the list without going back to it.
  await page.getByRole('button', { name: 'Next article' }).tap()
  await expect(article(page).getByRole('heading')).toHaveText('Generated 2')
  await page.getByRole('button', { name: 'Previous article' }).tap()
  await page.getByRole('button', { name: 'Previous article' }).tap()
  await expect(article(page).getByRole('heading')).toHaveText('Generated 4')
  await expect(
    page.getByRole('button', { name: 'Previous article' })
  ).toBeDisabled()

  // Mark unread, then back to the list: three opened, one unread again.
  await page.getByRole('button', { name: 'Mark unread' }).tap()
  await expect(page.getByRole('button', { name: 'Mark unread' })).toHaveCount(0)
  await back.tap()
  await expect(article(page)).toHaveCount(0)
  await expect(heading(page)).toContainText('2 unread')

  await unsubscribe(page, feed)
})

test('mark all above takes two taps, and says how many', async ({ page }) => {
  const feed = feedFor('phone-above', 4)
  const feedId = await subscribe(page, feed)

  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('4 unread')

  const row = articleRow(page, 'Generated 2')

  // The first tap only asks.
  await row
    .getByRole('button', { name: 'Mark all above Generated 2 as read' })
    .tap()

  const confirm = row.getByRole('button', {
    name: 'Confirm: mark 2 articles above Generated 2 as read',
  })

  await expect(confirm).toHaveText('Mark 2 above?')
  await expect(heading(page)).toContainText('4 unread')

  // The second does it, with the same undo.
  await confirm.tap()
  await expect(page.getByText('Marked 2 articles above as read.')).toBeVisible()
  await expect(heading(page)).toContainText('2 unread')
  await page.getByRole('button', { name: 'Undo' }).tap()
  await expect(heading(page)).toContainText('4 unread')

  // An unanswered question goes away by itself.
  await row
    .getByRole('button', { name: 'Mark all above Generated 2 as read' })
    .tap()
  await expect(confirm).toBeVisible()
  await expect(confirm).toHaveCount(0, { timeout: 6000 })
  await expect(heading(page)).toContainText('4 unread')

  await unsubscribe(page, feed)
})

test('tap targets are at least 44 px tall', async ({ page }) => {
  const feed = feedFor('phone-targets', 3)
  const feedId = await subscribe(page, feed)

  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('3 unread')
  expect(await page.evaluate("matchMedia('(pointer: coarse)').matches")).toBe(
    true
  )

  /**
   * Visible buttons, selects and header links shorter than 44 px. Not the
   * relative times ("2 hours ago", which swap in the exact time): an
   * optional extra, and 44 px each would make every row much taller.
   */
  const tooSmall = async () => {
    const small: string[] = []

    for (const target of await page
      .locator('button, select, header a')
      .filter({ visible: true })
      .filter({ hasNotText: /ago$|^just now$/ })
      .all()) {
      const box = await target.boundingBox()

      if (box !== null && box.height < 44) {
        small.push(`${(await target.textContent())?.trim()}: ${box.height}`)
      }
    }

    return small
  }

  expect(await tooSmall()).toEqual([])

  await tapRow(page, 'Generated 2')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 2')
  expect(await tooSmall()).toEqual([])

  await unsubscribe(page, feed)
})

test('a wide article never scrolls the page sideways', async ({ page }) => {
  const url = `${FEEDS}/wide.xml?run=${Date.now().toString(36)}`

  await page.goto('/settings')
  await page.getByLabel('Add a feed').fill(url)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(/^Added Wide content/)).toBeVisible()

  const row = page
    .getByRole('list', { name: 'Subscriptions' })
    .getByRole('listitem')
    .filter({ has: page.getByText(url, { exact: true }) })

  // Its own list: in All unread (oldest first) it sits behind other tests'
  // long feeds.
  const feedId = (await row.getAttribute('id'))?.replace('feed-', '')

  await page.goto(`/feeds/${feedId}`)
  await tapRow(page, 'Too wide for a phone')
  await expect(article(page).getByRole('heading')).toHaveText(
    'Too wide for a phone'
  )

  // Nothing is wider than the screen, the picture included.
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBe(390)
  expect(
    (
      await article(page)
        .getByRole('img', { name: 'Huge picture' })
        .boundingBox()
    )?.width ?? 0
  ).toBeLessThanOrEqual(390)

  // Clean up: remove the feed again.
  await page.goto('/settings')
  await row.getByRole('button', { name: /^Remove / }).click()
  await row.getByRole('button', { name: /^Remove .*\?$/ }).click()
  await expect(row).toHaveCount(0)
})

test('it can be added to the home screen', async ({ page, request }) => {
  await page.goto('/')
  await expect(articleList(page)).toBeAttached()

  // The manifest is fetched with credentials, so Access lets it through.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'crossorigin',
    'use-credentials'
  )

  const manifest = await (await request.get('/manifest.webmanifest')).json()

  expect(manifest).toMatchObject({
    name: 'Dusty',
    display: 'standalone',
    start_url: '/',
  })

  for (const icon of [
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-512.png',
    '/apple-touch-icon.png',
    '/logo.svg',
  ]) {
    const response = await request.get(icon)

    expect(response.status(), icon).toBe(200)
  }

  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]')
  ).toHaveAttribute('content', 'yes')
})
