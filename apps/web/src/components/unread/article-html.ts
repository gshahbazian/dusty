/**
 * Get stored (already cleaned) article HTML ready to show. Links open in a
 * new tab with no referrer; images load only as they near the screen and
 * send no referrer, so fewer publishers (and tracking pixels) learn when
 * an article is read. Done on an inert copy, before anything loads.
 */
export const prepareArticleHtml = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  for (const link of document.querySelectorAll('a[href]')) {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }

  for (const image of document.querySelectorAll('img')) {
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
  }

  return document.body.innerHTML
}
