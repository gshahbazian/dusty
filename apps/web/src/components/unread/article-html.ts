/**
 * Get stored (already cleaned) article HTML ready to show. Links open in a
 * new tab with no referrer; images load only as they near the screen and
 * send no referrer, so fewer publishers (and tracking pixels) learn when
 * an article is read; tables scroll in a wrapper. Done on an inert copy,
 * before anything loads.
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

  // Tables can be wider than the column: they scroll inside a wrapper
  // (Typeset's .typeset-scroll) instead of squeezing or widening the page.
  for (const table of document.querySelectorAll('table')) {
    const wrapper = document.createElement('div')

    wrapper.className = 'typeset-scroll'
    table.replaceWith(wrapper)
    wrapper.appendChild(table)
  }

  return document.body.innerHTML
}
