import { cn } from 'cn'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { backdropQuery } from '#/lib/queries'
import {
  FALLBACK_BACKDROP,
  UNSPLASH_HOME,
  localDay,
  withReferral,
} from '#/lib/backdrop'

/**
 * The article pane with no article open: a calm landscape from Unsplash,
 * centred, credited as Unsplash's API guidelines ask ("Photo by <name> on
 * Unsplash", both linked back with referral tags). One photo a day
 * (`server/backdrop.ts`), or a fixed one when Unsplash can't be asked
 * (local dev, no access key). Blank only while it loads.
 */
export function EmptyPane() {
  // Today, as of when the pane appeared: it appears afresh each time it
  // empties, so the next day's first empty pane shows the next photo.
  const [day] = useState(() => localDay(new Date()))
  const { data, isError, isFetchedAfterMount } = useQuery(backdropQuery(day))

  const backdrop = isError ? FALLBACK_BACKDROP : data

  if (backdrop === undefined) return null

  return (
    <figure className="flex h-full flex-col items-center justify-center gap-3 p-8 has-[img[data-failed]]:hidden">
      <a
        href={withReferral(backdrop.photoUrl)}
        target="_blank"
        rel="noreferrer"
        // Rounded like the images in an article (Typeset uses --radius).
        // The photo's own colour holds its place while it loads. Gone
        // (colour, credit and all) if the photo can't load.
        className="block w-full max-w-[29rem] overflow-hidden rounded-lg"
        style={{ backgroundColor: backdrop.color ?? undefined }}
      >
        <img
          src={backdrop.imageUrl}
          alt={backdrop.alt}
          referrerPolicy="no-referrer"
          decoding="async"
          // Fades in once loaded, when fetched for this pane; marked on the
          // element itself, so no state. The day's photo already in hand (a
          // refresh, or back from an article) shows at once.
          onLoad={(event) => {
            event.currentTarget.dataset.loaded = 'true'
          }}
          onError={(event) => {
            event.currentTarget.dataset.failed = 'true'
          }}
          className={cn(
            'aspect-[3/2] w-full rounded-lg object-cover',
            isFetchedAfterMount &&
              'opacity-0 transition-opacity duration-500 data-loaded:opacity-100'
          )}
        />
      </a>
      {/* The credit Unsplash's API guidelines ask for, in their words. */}
      <figcaption className="text-muted-foreground text-xs">
        Photo by{' '}
        <a
          href={withReferral(backdrop.photographerUrl)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground underline underline-offset-2"
        >
          {backdrop.photographerName}
        </a>{' '}
        on{' '}
        <a
          href={withReferral(UNSPLASH_HOME)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground underline underline-offset-2"
        >
          Unsplash
        </a>
      </figcaption>
    </figure>
  )
}
