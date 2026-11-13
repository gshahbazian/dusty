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

  await expect(page.getByText('Signed in as')).toBeVisible()
  expect((await syncRequest).status()).toBe(200)
})
