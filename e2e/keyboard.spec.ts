import { expect, test, type Page } from '@playwright/test'

import {
  AFTER_REFRESH,
  articleList,
  articleRow,
  feedFor,
  heading,
  landNewArticle,
  subscribe,
  unsubscribe,
} from '~/e2e/helpers'

/** The keyboard: a full triage pass with no mouse, and long lists. */

const cursorRow = (page: Page) => articleList(page).locator('[data-cursor]')

/** The cursor is on the row with exactly this title. */
const expectCursorOn = (page: Page, title: string) =>
  expect(
    cursorRow(page).getByText(title, { exact: true }).first()
  ).toBeVisible()

const keys = async (page: Page, ...presses: string[]) => {
  for (const press of presses) await page.keyboard.press(press)
}

const article = (page: Page) => page.getByRole('article', { name: 'Article' })

test('a triage pass by keyboard alone', async ({ page, request }) => {
  test.slow()

  const feed = feedFor('keys', 6)
  const feedId = await subscribe(page, feed)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('6 unread')

  // Moving: newest first, so Generated 6 is on top.
  await expectCursorOn(page, 'Generated 6')
  await keys(page, 'j')
  await expectCursorOn(page, 'Generated 5')
  await keys(page, '2', 'j')
  await expectCursorOn(page, 'Generated 3')
  await keys(page, 'k')
  await expectCursorOn(page, 'Generated 4')
  await keys(page, 'Shift+G')
  await expectCursorOn(page, 'Generated 1')
  await keys(page, 'g', 'g')
  await expectCursorOn(page, 'Generated 6')

  // Reading: open, then j / k go to the next and previous article without
  // closing; q closes.
  await keys(page, 'Enter')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 6')
  await expect(page).toHaveURL(/\?article=\d+$/)
  await keys(page, 'j')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 5')
  await expectCursorOn(page, 'Generated 5')
  await keys(page, 'k')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 6')
  await keys(page, 'q')
  await expect(article(page)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/feeds/${feedId}$`))

  // Both opened articles were read; `m` toggles the cursor row back.
  await expect(heading(page)).toContainText('4 unread')
  await keys(page, 'm')
  await expect(heading(page)).toContainText('5 unread')
  await expect(articleRow(page, 'Generated 6')).not.toContainText('(read)')

  // A sync lands while the list is on screen.
  await landNewArticle(page, request, feed, feedId, 'Generated 7')

  // `A` on Generated 3: above it are 6, 5 (already read) and 4. Only 6 and
  // 4 change, and the late Generated 7 is never touched.
  await keys(page, '3', 'j')
  await expectCursorOn(page, 'Generated 3')
  await keys(page, 'Shift+A')
  await expect(page.getByText('Marked 2 articles above as read.')).toBeVisible()
  await expect(heading(page)).toContainText('3 unread')

  // `u` undoes exactly that action, once.
  await keys(page, 'u')
  await expect(page.getByText('Undone: 2 articles unread again.')).toBeVisible()
  await expect(heading(page)).toContainText('5 unread')
  await keys(page, 'u')
  await expect(page.getByText('Nothing to undo.')).toBeVisible()

  // `r` refreshes: Generated 7 appears, 5 (read) drops out, and the cursor
  // stays on the same article.
  await keys(page, 'r')
  await expect(articleList(page).getByRole('listitem')).toHaveText(
    [
      /Generated 7/,
      /Generated 6/,
      /Generated 4/,
      /Generated 3/,
      /Generated 2/,
      /Generated 1/,
    ],
    AFTER_REFRESH
  )
  await expectCursorOn(page, 'Generated 3')

  // `?` shows every binding; `q` closes it.
  await keys(page, 'Shift+?')

  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })

  await expect(help).toBeVisible()
  await expect(help).toContainText('Mark all above as read')
  await keys(page, 'q')
  await expect(help).toHaveCount(0)

  // Pages by key.
  await keys(page, 'g', 's')
  await expect(page).toHaveURL(/\/settings$/)
  await keys(page, 'g', 'a')
  await expect(page).toHaveURL(/\/$/)

  await unsubscribe(page, feed)
})

test('typing in a field never fires a shortcut', async ({ page }) => {
  await page.goto('/settings')

  const field = page.getByLabel('Add a feed')

  await field.click()
  await page.keyboard.type('ga?gs jkA')
  await expect(field).toHaveValue('ga?gs jkA')
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('an unfinished g times out instead of changing a later key', async ({
  page,
}) => {
  const feed = feedFor('timeout')
  const feedId = await subscribe(page, feed)

  await page.goto(`/feeds/${feedId}`)
  await expectCursorOn(page, 'Generated 3')
  await keys(page, 'j')
  await expectCursorOn(page, 'Generated 2')

  // `g`, a pause past the timeout, then `g`: not `gg`.
  await keys(page, 'g')
  await page.waitForTimeout(1200)
  await keys(page, 'g')
  await expectCursorOn(page, 'Generated 2')

  await unsubscribe(page, feed)
})

test('a 3,000-article list stays small in the page', async ({ page }) => {
  const feed = feedFor('long', 3000)
  const feedId = await subscribe(page, feed)

  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('3000 unread')
  await expectCursorOn(page, 'Generated 3000')

  // Only the rows near the screen are in the DOM.
  expect(await articleList(page).getByRole('listitem').count()).toBeLessThan(60)

  // `G` reaches the last row, drawn and on screen.
  await keys(page, 'Shift+G')
  await expectCursorOn(page, 'Generated 1')
  await expect(cursorRow(page)).toHaveAttribute('aria-posinset', '3000')
  await expect(cursorRow(page)).toBeInViewport()

  await unsubscribe(page, feed)
})

test('a clicked row button lets go of the keyboard', async ({ page }) => {
  const feed = feedFor('focus', 4)
  const feedId = await subscribe(page, feed)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/feeds/${feedId}`)
  await expectCursorOn(page, 'Generated 4')
  await keys(page, 'j')
  await expectCursorOn(page, 'Generated 3')

  // Clicking a row's title opens it; its button stays on screen. After
  // closing, moving the cursor and pressing Enter opens the cursor's row,
  // not the clicked one again.
  await articleRow(page, 'Generated 4').getByRole('button').first().click()
  await expect(article(page).getByRole('heading')).toHaveText('Generated 4')
  await keys(page, 'q')
  await expect(article(page)).toHaveCount(0)
  await keys(page, 'j')
  await expectCursorOn(page, 'Generated 3')
  await keys(page, 'Enter')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 3')

  await unsubscribe(page, feed)
})

test('after clicking a row, j and k go to the next and previous article', async ({
  page,
}) => {
  const feed = feedFor('click-jk', 4)
  const feedId = await subscribe(page, feed)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/feeds/${feedId}`)

  // The owner's report: click a row with the mouse, then j and k.
  await articleRow(page, 'Generated 3').getByRole('button').first().click()
  await expect(article(page).getByRole('heading')).toHaveText('Generated 3')
  await keys(page, 'j')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 2')
  await expectCursorOn(page, 'Generated 2')
  await keys(page, 'k', 'k')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 4')

  // The arrow keys and Space scroll it instead: still the same article.
  await keys(page, 'ArrowDown', 'Space', 'Shift+Space', 'ArrowUp')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 4')

  // `o` opens its original page in a new tab (answered here, not fetched).
  await page
    .context()
    .route('https://generated.example.com/**', (route) =>
      route.fulfill({ body: 'original' })
    )

  const original = page.context().waitForEvent('page')

  await keys(page, 'o')
  await expect(await original).toHaveURL(
    `https://generated.example.com/${feed.id}/4`
  )

  await unsubscribe(page, feed)
})

test('j and k open the next article at its top, wherever the last one was scrolled', async ({
  page,
}) => {
  const feed = feedFor('scroll-top', 3)
  const feedId = await subscribe(page, feed)

  // A short window, so even a short article scrolls.
  await page.setViewportSize({ width: 1280, height: 260 })
  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('3 unread')

  // The article pane's scroll offset, and scrolling it to the bottom.
  const scrollTop = () =>
    page.evaluate("document.getElementById('article-pane').scrollTop")

  const scrollToBottom = () =>
    page.evaluate(
      "document.getElementById('article-pane').scrollTo({ top: 10000 })"
    )

  await keys(page, 'Enter')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 3')

  // Read down the first one, then move on.
  await scrollToBottom()
  expect(await scrollTop()).toBeGreaterThan(0)

  await keys(page, 'j')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 2')
  expect(await scrollTop()).toBe(0)

  await scrollToBottom()
  await keys(page, 'k')
  await expect(article(page).getByRole('heading')).toHaveText('Generated 3')
  expect(await scrollTop()).toBe(0)

  await unsubscribe(page, feed)
})
