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
  expect((await syncRequest).status()).toBe(200)

  // Logging out lives in Settings' Account section.
  await page.goto('/settings/account')
  await expect(page.getByRole('link', { name: 'Log out' })).toBeVisible()
})

test("the empty pane's photo credits its photographer and Unsplash", async ({
  page,
}) => {
  await page.goto('/')

  // As Unsplash's API guidelines ask: "Photo by <name> on Unsplash", both
  // linked, with the referral tags.
  const credit = page.locator('figcaption')

  await expect(credit).toHaveText(/^Photo by .+ on Unsplash$/)
  await expect(credit.getByRole('link').first()).toHaveAttribute(
    'href',
    /^https:\/\/unsplash\.com\/@[^?]+\?utm_source=dusty&utm_medium=referral$/
  )
  await expect(credit.getByRole('link', { name: 'Unsplash' })).toHaveAttribute(
    'href',
    'https://unsplash.com/?utm_source=dusty&utm_medium=referral'
  )
})
