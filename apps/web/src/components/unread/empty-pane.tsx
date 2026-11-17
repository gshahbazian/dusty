import { cn } from 'cn'
import { useQuery } from '@tanstack/react-query'

import { backdropQuery } from '#/lib/queries'
import { FALLBACK_BACKDROP } from '#/lib/backdrop'

/**
 * The article pane with no article open: a calm landscape from Unsplash,
 * centred, with no credit line (the owner's choice). A new one each time
 * the pane empties, kept across a refresh (or a fixed one, until the
 * Unsplash API can be used).
 * Blank only while it loads.
 */
export function EmptyPane() {
  const { data, isError, isFetchedAfterMount } = useQuery(backdropQuery())
  const backdrop = isError ? FALLBACK_BACKDROP : data

  if (backdrop === undefined) return null

  return (
    <figure className="flex h-full items-center justify-center p-8">
      {/* The photo's own colour holds its place while it loads. */}
      <div
        // Rounded like the images in an article (Typeset uses --radius).
        // Gone (colour and all) if the photo can't load.
        className="w-full max-w-[29rem] overflow-hidden rounded-lg has-[img[data-failed]]:hidden"
        style={{ backgroundColor: backdrop.color ?? undefined }}
      >
        <img
          src={backdrop.imageUrl}
          alt={backdrop.alt}
          referrerPolicy="no-referrer"
          decoding="async"
          // A new photo fades in once loaded; marked on the element itself,
          // so no state. One kept from before (a refresh remounts the pane)
          // shows at once.
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
      </div>
    </figure>
  )
}
