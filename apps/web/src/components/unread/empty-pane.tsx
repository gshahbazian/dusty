import { useQuery } from '@tanstack/react-query'

import { backdropQuery } from '#/lib/queries'
import { FALLBACK_BACKDROP } from '#/server/backdrop'

/**
 * The article pane with no article open: a calm landscape from Unsplash,
 * centred, with no credit line (the owner's choice). A new one each time
 * the pane empties (or a fixed one, until the Unsplash API can be used).
 * Blank only while it loads.
 */
export function EmptyPane() {
  const { data, isError } = useQuery(backdropQuery())
  const backdrop = isError ? FALLBACK_BACKDROP : data

  if (backdrop === undefined) return null

  return (
    <figure className="flex h-full items-center justify-center p-8">
      {/* The photo's own colour holds its place while it loads. */}
      <div
        // Rounded like the images in an article (Typeset uses --radius).
        className="w-full max-w-[29rem] overflow-hidden rounded-lg"
        style={{ backgroundColor: backdrop.color ?? undefined }}
      >
        <img
          src={backdrop.imageUrl}
          alt={backdrop.alt}
          referrerPolicy="no-referrer"
          decoding="async"
          // Fades in once loaded; marked on the element itself, so no state.
          onLoad={(event) => {
            event.currentTarget.dataset.loaded = 'true'
          }}
          className="aspect-[3/2] w-full rounded-lg object-cover opacity-0 transition-opacity duration-500 data-loaded:opacity-100"
        />
      </div>
    </figure>
  )
}
