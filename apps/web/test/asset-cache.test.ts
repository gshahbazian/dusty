import { describe, expect, test } from 'vitest'

import { withAssetCaching } from '#/server/asset-cache'

const cacheControl = (path: string, status = 200) =>
  withAssetCaching(
    new Request(`https://dusty.example.com${path}`),
    new Response('body', {
      status,
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    })
  ).headers.get('Cache-Control')

describe('asset caching', () => {
  test('hashed build output is kept for a year, never revalidated', () => {
    expect(cacheControl('/assets/geist-latin-wght-normal-BgDaEnEv.woff2')).toBe(
      'public, max-age=31536000, immutable'
    )
    expect(cacheControl('/assets/styles-Ce3vqsJN.css')).toBe(
      'public, max-age=31536000, immutable'
    )
  })

  test('files that keep their names, and failures, are left alone', () => {
    expect(cacheControl('/manifest.webmanifest')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(cacheControl('/logo.svg')).toBe('public, max-age=0, must-revalidate')
    expect(cacheControl('/assets/gone-abc123.js', 500)).toBe(
      'public, max-age=0, must-revalidate'
    )
  })
})
