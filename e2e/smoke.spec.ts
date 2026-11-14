import { expect, test } from '@playwright/test'

test('the app loads as the owner and starts a background sync', async ({
  page,
}) => {
  const syncRequest = page.waitForResponse(
    (response) =>
      response.url().includes('/_serverFn/') &&
      response.request().method() === 'POST'
  )

  await page.goto('/')

  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
      name: 'Settings',
    })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log out' })).toBeVisible()
  expect((await syncRequest).status()).toBe(200)
})
