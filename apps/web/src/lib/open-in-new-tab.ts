/** Open a page in a new tab, with no way back to Dusty and no referrer. */
export const openInNewTab = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer')
}
