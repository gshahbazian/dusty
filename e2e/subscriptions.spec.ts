import { expect, test, type Page } from '@playwright/test'

import { DEV_FEEDS_PORT } from '~/infra/dev'

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
  await expect(
    page.getByRole('heading', { name: 'Subscriptions' })
  ).toBeAttached()

  // A feed URL: checked, titled, and its articles pulled straight away.
  await addFeed(page, rss)
  await expect(
    page.getByText('Added Example RSS with 3 articles.')
  ).toBeVisible()
  await expect(row(page, rss)).toContainText(/Last synced:\s*just now/)
  // Its name links to the website's home page.
  await expect(
    row(page, rss).getByRole('link', { name: 'Example RSS' })
  ).toHaveAttribute('href', 'https://rss.example.com/')

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

  // Esc backs out of a rename, changing nothing.
  await row(page, rss).getByRole('button', { name: 'Rename' }).click()
  await page.keyboard.type('Never saved')
  await page.keyboard.press('Escape')
  await expect(row(page, rss).getByLabel(/New name for/)).toHaveCount(0)
  await expect(row(page, rss)).not.toContainText('Never saved')

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

  // Remove takes a second, explicit click, warning that unread articles go.
  await row(page, rss).getByRole('button', { name: 'Remove' }).click()
  await expect(
    row(page, rss).getByRole('button', {
      name: `Remove My RSS ${run} and its 3 unread articles?`,
    })
  ).toBeVisible()
  await row(page, rss).getByRole('button', { name: 'Keep it' }).click()
  await remove(page, rss)
})

test("a site's home page leads to its feed", async ({ page }) => {
  // site.html advertises /rss.xml itself (its link drops the query string),
  // so this run cannot have a URL of its own. A seeded dev database may
  // already have that feed; only remove it again if this run added it.
  const advertised = `${FEEDS}/rss.xml`

  await page.goto('/settings')
  await expect(
    page.getByRole('heading', { name: 'Subscriptions' })
  ).toBeAttached()
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
  <outline type="rss" text="Old FTP feed" xmlUrl="ftp://files.example.com/feed.xml"/>
</body></opml>`

  await page.goto('/settings/import')
  await page.getByLabel('Choose an OPML file').setInputFiles({
    name: 'subscriptions.opml',
    mimeType: 'text/xml',
    buffer: Buffer.from(opml),
  })

  const results = (name: string) =>
    page.getByRole('list', { name }).getByRole('listitem')

  // The preview lists what it will import, and what it skips and why.
  await expect(results('To import')).toHaveText([
    'Atom from my old reader',
    'JSON',
    'Broken',
  ])
  // Not a web address: skipped, never counted or reported as added.
  await expect(results('Skipped')).toHaveText([
    'Atom again: listed twice in this file',
    'Old FTP feed: not a web address',
  ])
  await page.getByRole('button', { name: 'Import 3 feeds' }).click()

  await expect(results('Added')).toHaveText(['Atom from my old reader', 'JSON'])
  await expect(results('Skipped')).toHaveText([
    'Atom again: listed twice in this file',
    'Old FTP feed: not a web address',
  ])
  await expect(results('Failed')).toHaveText(['Broken: 404 not found'])

  // A feed that failed is subscribed anyway, showing its error.
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Subscriptions' })
    .click()
  await expect(row(page, broken)).toContainText('Broken')
  await expect(row(page, broken)).toContainText(
    'Last fetch failed: 404 not found'
  )

  // The old reader's name is kept, and imported feeds' articles arrive
  // read: removing one has no unread articles to warn about.
  await expect(row(page, atom)).toContainText('Atom from my old reader')
  await row(page, atom).getByRole('button', { name: 'Remove' }).click()
  await expect(
    row(page, atom).getByRole('button', {
      name: 'Remove Atom from my old reader?',
      exact: true,
    })
  ).toBeVisible()
  await row(page, atom).getByRole('button', { name: 'Keep it' }).click()

  await remove(page, atom)
  await remove(page, json)
  await remove(page, broken)
})

test('junk in the URL falls back to the default view', async ({ page }) => {
  // The router spreads the validated search over the raw query, so this
  // catches a validator that drops a bad key instead of overriding it.
  await page.goto('/settings?sort=bogus&attention=maybe')
  await expect(page.getByRole('button', { name: 'Sort: Name' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Filter: All feeds' })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/settings$/)

  // A good value next to a bad one is kept.
  await page.goto('/settings?sort=latest&attention=maybe')
  await expect(
    page.getByRole('button', { name: 'Sort: Last article' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Filter: All feeds' })
  ).toBeVisible()
})

test('filter and sort from their menus', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Filter: All feeds' }).click()
  await page.getByRole('menuitemradio', { name: 'Needs attention' }).click()
  await expect(page).toHaveURL(/attention=true/)
  await expect(
    page.getByRole('button', { name: 'Filter: Needs attention' })
  ).toBeVisible()

  await page.getByRole('button', { name: 'Sort: Name' }).click()
  await page.getByRole('menuitemradio', { name: 'Problems first' }).click()
  await expect(page).toHaveURL(/sort=attention/)
  await expect(page).toHaveURL(/attention=true/)
})
