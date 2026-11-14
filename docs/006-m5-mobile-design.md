# M5: the phone

M5 makes the phone a first-class reader. The brief is the spec's "Mobile"
section; follow-ups from earlier milestones are at the end of
`docs/004-m3-unread-design.md` and `docs/005-m4-keyboard-design.md`. The
UI stays deliberately plain (the owner will design it by hand later): the
point is that every feature works by touch, one-handed.

## Already true

- List and article are separate screens on a phone, with a way back
  (M4's layout), and the app follows the system light or dark setting.
- The list appears from stored data; syncing never blocks it.
- Refresh is one tap on its button (the spec: no pull to refresh).

## Mark all above, by touch

- The row's "Mark all above as read" asks first: one tap turns it into
  "Mark N above?" (N is the number of rows above, so the owner sees what
  it will do), a second tap does it. It goes back after a few seconds, or
  when another row's action is used. Same code, same undo.
- This is the same two-tap pattern as removing a feed. It's on every
  screen size, so the rows behave the same everywhere (the spec's "same
  row layout and actions"); `A` on a keyboard stays a single press.

## Thumb reach and tap targets

- With an article open on a phone, its actions sit in a bar at the bottom
  of the screen: Back, Mark unread, Previous and Next. Previous and Next
  are the touch version of `k` / `j`, so reading through a list needs no
  trip back to it. On wider screens the same bar sits at the top of the
  article.
- On a touch screen (`pointer: coarse`), buttons in rows and bars are at
  least 44 px tall. Mouse screens keep the compact size.
- The toast sits above the bottom bar, not on it.
- Bars respect the safe areas (the iPhone's home indicator and notch) when
  the app runs full screen.

## Reading

- Article text is 17 px on a phone. Images, wide tables and code already
  fit the screen or scroll inside themselves; a browser test checks that
  an article with a very wide image, table and code block never scrolls
  the page sideways.

## Add to home screen

- A web app manifest: name, `display: standalone`, theme colours, and
  icons (an SVG, plus PNGs made from it, including the 180 px Apple touch
  icon).
- The manifest is requested with credentials (`crossorigin=
  "use-credentials"`). Without them, Cloudflare Access would answer the
  manifest request with a login redirect and the phone would ignore it.
- Apple's meta tags make it open full screen with a matching status bar.

## Screen readers

- Moving the cursor by key announces the row ("3 of 40: title"), through
  a polite live region (left from M4).

## Also

- Excerpts ran paragraphs together ("…end of oneStart of two"): plain text
  now keeps a space after each block element (paragraph, list item, line
  break, heading…).
- Relative times ("2 hours ago") are plain text with the exact time as a
  hover tooltip. They used to swap to the exact time on a tap; the owner
  dropped that (after M5) as noise, so a phone shows only the relative
  time.
- The icon is the logo, a pixel-art dustpan (`apps/web/public/logo.svg`,
  also the favicon). The PNGs are drawn from its 16×16 grid at whole
  pixels per grid cell (12 px for 192, 32 px for 512, 11 px centred on the
  180 px Apple icon), so they stay sharp. The maskable icon has a white
  margin so the dustpan sits inside the safe circle.

## Tests

- Unit: plain text keeps blocks apart.
- Playwright on a phone (390×844, touch): open an article from the list,
  Next and Previous, Mark unread in the bottom bar, Back; mark all above
  takes two taps, says how many, can be undone, and an unanswered first
  tap goes away by itself; every button, select and header link is at
  least 44 px tall; an article with a very wide image, table, code block
  and address never scrolls the page sideways; the manifest (fetched with
  credentials) and icons load.
