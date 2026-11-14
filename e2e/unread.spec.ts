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
  await articleRow(page, 'Generated 1')
    .getByRole('button', {
      name: 'Confirm: mark 2 articles above Generated 1 as read',
    })
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
  await articleRow(page, 'Generated 1')
    .getByRole('button', {
      name: 'Confirm: mark 2 articles above Generated 1 as read',
    })
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
    article.getByRole('link', { name: 'Generated 2' })
  ).toHaveAttribute('href', `https://generated.example.com/${feed.id}/2`)

  // The feed's name links to its website.
  await expect(
    article.getByRole('link', { name: `Generated ${feed.id}`, exact: true })
  ).toHaveAttribute('href', 'https://generated.example.com/')
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

  // Mark unread is `m` on a wide screen (the button bar is for phones).
  await page.keyboard.press('m')
  await expect(heading(page)).toContainText('3 unread')
  await expect(articleRow(page, 'Generated 2')).not.toContainText('(read)')

  // Close it (Back is for phones; Esc here), and the list is just as it
  // was.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(new RegExp(`/feeds/${feedId}$`))
  await expect(articleList(page).getByRole('listitem')).toHaveCount(3)

  // A link to an article that is already read, so not in the list: `m`
  // marks it unread, not the top row.
  await openArticle(page, 'Generated 3')
  await expect(heading(page)).toContainText('2 unread')

  const link = page.url()

  await page.goto(link)
  await expect(articleList(page).getByRole('listitem')).toHaveCount(2)
  await expect(
    article.getByRole('heading', { name: 'Generated 3' })
  ).toBeVisible()
  await page.keyboard.press('m')
  await expect(articleRow(page, 'Generated 2')).not.toContainText('(read)')

  // It isn't one of this list's rows, so the count catches up on refresh.
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(heading(page)).toContainText('3 unread', AFTER_REFRESH)

  await unsubscribe(page, feed)
})

test('right-click a row for its actions', async ({ page }) => {
  const feed = feedFor('context', 4)
  const feedId = await subscribe(page, feed)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('4 unread')

  const menu = page.getByRole('menu')
  const item = (name: RegExp) => menu.getByRole('menuitem', { name })

  // Mark one read.
  await articleRow(page, 'Generated 4').click({ button: 'right' })
  await item(/^Mark read/).click()
  await expect(heading(page)).toContainText('3 unread')

  // Mark all above, straight from the menu (no second step).
  await articleRow(page, 'Generated 2').click({ button: 'right' })
  await item(/^Mark all above as read/).click()
  await expect(heading(page)).toContainText('2 unread')

  // The top row has nothing above it.
  await articleRow(page, 'Generated 4').click({ button: 'right' })
  await expect(item(/^Mark all above as read/)).toBeDisabled()

  // Esc closes the menu and nothing else.
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // Open.
  await articleRow(page, 'Generated 1').click({ button: 'right' })
  await item(/^Open(?! page)/).click()
  await expect(
    page.getByRole('article', { name: 'Article' }).getByRole('heading')
  ).toHaveText('Generated 1')

  // With the article open, Esc on a menu leaves the article open.
  await articleRow(page, 'Generated 2').click({ button: 'right' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Article' })).toBeVisible()

  await unsubscribe(page, feed)
})

test("a feed's page shows its unread articles, or all of them", async ({
  page,
}) => {
  const feed = feedFor('show-all')
  const feedId = await subscribe(page, feed)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`/feeds/${feedId}`)
  await expect(heading(page)).toContainText('3 unread')

  const show = page.getByRole('group', { name: 'Show' })

  // Read one: unread now lists two after a reload of the list.
  await articleRow(page, 'Generated 3')
    .getByRole('button', { name: 'Mark Generated 3 read' })
    .click()
  await expect(heading(page)).toContainText('2 unread')

  // All: all three, the read one dimmed and marked so.
  await show.getByRole('button', { name: 'All' }).click()
  await expect(page).toHaveURL(/\?show=all$/)
  await expect(articleList(page).getByRole('listitem')).toHaveCount(3)
  await expect(articleRow(page, 'Generated 3')).toContainText('(read)')
  await expect(heading(page)).toContainText('2 unread')

  // Marking it unread from here counts it again.
  await articleRow(page, 'Generated 3')
    .getByRole('button', { name: 'Mark Generated 3 unread' })
    .click()
  await expect(heading(page)).toContainText('3 unread')

  // Back to unread only, and the choice survives a reload.
  await show.getByRole('button', { name: 'Unread' }).click()
  await expect(page).toHaveURL(new RegExp(`/feeds/${feedId}$`))
  await expect(articleList(page).getByRole('listitem')).toHaveCount(3)

  // All unread has no such toggle.
  await page.goto('/')
  await expect(show).toHaveCount(0)

  await unsubscribe(page, feed)
})

test('the feed picker lists every feed, caught up or not', async ({ page }) => {
  const feed = feedFor('caught-up', 2)
  const feedId = await subscribe(page, feed)

  await page.goto(`/feeds/${feedId}`)

  for (const title of ['Generated 2', 'Generated 1']) {
    await articleRow(page, title)
      .getByRole('button', { name: `Mark ${title} read` })
      .click()
  }

  await expect(heading(page)).toContainText('0 unread')
  await page.goto('/')

  await expect(
    page.getByRole('combobox', { name: 'Feed' }).getByRole('option', {
      name: `Generated ${feed.id} (0)`,
    })
  ).toHaveCount(1)

  await unsubscribe(page, feed)
})
