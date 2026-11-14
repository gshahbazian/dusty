import { cn } from 'cn'
import { useEffect, useState } from 'react'

import {
  FALLBACK_BACKDROP,
  getBackdrop,
  type Backdrop,
} from '../../server/backdrop.ts'

/**
 * The article pane with no article open: a calm landscape from Unsplash,
 * centred, with no credit line (the owner's choice). A new one each time
 * the pane empties
 * (or a fixed one, until the Unsplash API can be used). Blank only while
 * it loads.
 */
export function EmptyPane() {
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let current = true

    getBackdrop().then(
      (photo) => {
        if (current) setBackdrop(photo)
      },
      () => {
        if (current) setBackdrop(FALLBACK_BACKDROP)
      }
    )

    return () => {
      current = false
    }
  }, [])

  if (backdrop === null) return null

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
          onLoad={() => setLoaded(true)}
          className={cn(
            'aspect-[3/2] w-full rounded-lg object-cover transition-opacity duration-500',
            !loaded && 'opacity-0'
          )}
        />
      </div>
    </figure>
  )
}
