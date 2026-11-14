import { expect, test, type Page } from '@playwright/test'

import { DEV_FEEDS_PORT } from '../infra/dev.ts'

/**
 * The subscriptions page against the running dev stack and its fixture feed
 * server (`dev-start.sh` starts both). Each run uses its own feed URLs (the
 * feed server ignores the query string), so earlier runs and seeded feeds
 * never get in the way, and it removes what it added.
 */
const run = Date.now().toString(36)
const FEEDS = `http://localhost:${DEV_FEEDS_PORT}`
const feedUrl = (path: string) => `${FEEDS}/${path}?run=${run}`

const addFeed = async (page: Page, url: string) => {
  await page.getByLabel('Add a feed').fill(url)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

/** A subscription's row, found by its exact feed URL. */
const row = (page: Page, url: string) =>
  page
    .getByRole('list', { name: 'Subscriptions' })
    .getByRole('listitem')
    .filter({ has: page.getByText(url, { exact: true }) })

const remove = async (page: Page, url: string) => {
  await row(page, url).getByRole('button', { name: 'Remove' }).click()
  await row(page, url)
    .getByRole('button', { name: /^Remove .*\?$/ })
    .click()
  await expect(row(page, url)).toHaveCount(0)
}

test('add, refuse, rename and remove feeds', async ({ page }) => {
  const rss = feedUrl('rss.xml')

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // A feed URL: checked, titled, and its articles pulled straight away.
  await addFeed(page, rss)
  await expect(
    page.getByText('Added Example RSS with 3 articles.')
  ).toBeVisible()
  await expect(row(page, rss)).toContainText('3 unread')
  await expect(row(page, rss)).toContainText(/Last synced:\s*just now/)

  // The same feed again is refused, with a pointer to the one already there.
  await addFeed(page, rss)
  await expect(
    page.getByText('Already subscribed as Example RSS.')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Show it' }).click()

  // Something that is not a feed is refused, with the reason.
  await addFeed(page, feedUrl('status/404'))
  await expect(
    page.getByText("Couldn't add that: 404 not found.")
  ).toBeVisible()
  await addFeed(page, feedUrl('html'))
  await expect(
    page.getByText("Couldn't add that: no feed found at this address.")
  ).toBeVisible()

  // Rename, keeping the feed's own name visible.
  await row(page, rss).getByRole('button', { name: 'Rename' }).click()
  // The field takes the cursor, so you can just type.
  await expect(row(page, rss).getByLabel(/New name for/)).toBeFocused()
  await page.keyboard.type(`My RSS ${run}`)
  await row(page, rss).getByRole('button', { name: 'Save' }).click()
  await expect(row(page, rss)).toContainText(`My RSS ${run}`)
  await expect(row(page, rss)).toContainText(
    'The feed calls itself Example RSS'
  )

  // Remove takes a second, explicit click.
  await remove(page, rss)
})

test("a site's home page leads to its feed", async ({ page }) => {
  // site.html advertises /rss.xml itself (its link drops the query string),
  // so this run cannot have a URL of its own. A seeded dev database may
  // already have that feed; only remove it again if this run added it.
  const advertised = `${FEEDS}/rss.xml`

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const alreadyThere = (await row(page, advertised).count()) > 0

  await addFeed(page, `${FEEDS}/site.html?run=${run}`)

  if (alreadyThere) {
    await expect(page.getByText(/^Already subscribed as .+\.$/)).toBeVisible()
    await expect(row(page, advertised)).toHaveCount(1)

    return
  }

  await expect(
    page.getByText('Added Example RSS with 3 articles.')
  ).toBeVisible()
  await expect(row(page, advertised)).toHaveCount(1)
  await remove(page, advertised)
})

test('import from an OPML file', async ({ page }) => {
  const atom = feedUrl('atom.xml')
  const json = feedUrl('feed.json')
  // Its own URL: the other test adds status/404 by hand, in parallel.
  const broken = `${feedUrl('status/404')}&from=opml`

  const opml = `<?xml version="1.0"?>
<opml version="2.0"><head><title>Old reader</title></head><body>
  <outline text="Folder">
    <outline type="rss" text="Atom from my old reader" xmlUrl="${atom}"/>
    <outline type="rss" text="JSON" xmlUrl="${json}"/>
  </outline>
  <outline type="rss" text="Broken" xmlUrl="${broken.replaceAll('&', '&amp;')}"/>
  <outline type="rss" text="Atom again" xmlUrl="${atom}"/>
</body></opml>`

  await page.goto('/settings')
  await page.getByLabel('Choose an OPML file').setInputFiles({
    name: 'subscriptions.opml',
    mimeType: 'text/xml',
    buffer: Buffer.from(opml),
  })

  await expect(
    page.getByText('3 feeds to import, 1 already subscribed or listed twice.')
  ).toBeVisible()
  await page.getByText('Show the 1 skipped feed').click()
  await expect(
    page.getByText('Atom again: listed twice in this file')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Import 3 feeds' }).click()

  await expect(
    page.getByText('Import finished: 2 added, 1 skipped, 1 failed.')
  ).toBeVisible()
  await expect(page.getByText('Broken: 404 not found')).toBeVisible()

  // A feed that failed is subscribed anyway, showing its error.

  await expect(row(page, broken)).toContainText('Broken')
  await expect(row(page, broken)).toContainText(
    'Last fetch failed: 404 not found'
  )

  // Imported feeds' articles arrive read; the old reader's name is kept.
  await expect(row(page, atom)).toContainText('Atom from my old reader')
  await expect(row(page, atom)).toContainText('0 unread')
  await expect(row(page, json)).toContainText('0 unread')

  await remove(page, atom)
  await remove(page, json)
  await remove(page, broken)
})

test('junk in the URL falls back to the default view', async ({ page }) => {
  // The router spreads the validated search over the raw query, so this
  // catches a validator that drops a bad key instead of overriding it.
  await page.goto('/settings?sort=bogus&attention=maybe')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveValue('attention')
  await expect(
    page.getByRole('checkbox', { name: 'Only feeds that need attention' })
  ).not.toBeChecked()
  await expect(page).toHaveURL(/\/settings$/)

  // A good value next to a bad one is kept.
  await page.goto('/settings?sort=name&attention=maybe')
  await expect(page.getByRole('combobox')).toHaveValue('name')
  await expect(
    page.getByRole('checkbox', { name: 'Only feeds that need attention' })
  ).not.toBeChecked()
})
