import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleDotIcon,
} from 'lucide-react'

import { Button } from '#/components/ui/button'

/**
 * Phones only: the open article's actions in a bar at the bottom of the
 * screen, within thumb reach (clear of the home indicator). On a phone the
 * article replaces the list, so this is the way back, and Previous, Next and
 * the read toggle are the touch versions of `k`, `j` and `m`. On a wide
 * screen the list stays beside the article and the keys do all of it, so
 * the bar is hidden.
 */
export function MobileArticleBar({
  read,
  onBack,
  onPrevious,
  onNext,
  onMarkRead,
  onMarkUnread,
}: {
  read: boolean
  onBack: () => void
  /** The previous and next article in the list (null at either end). */
  onPrevious: (() => void) | null
  onNext: (() => void) | null
  onMarkRead: () => void
  onMarkUnread: () => void
}) {
  return (
    // Four icon buttons spread evenly across the bar, always in the same
    // places (the read toggle is always there), each a 44 px square for a
    // thumb and named for screen readers.
    <div className="bg-background fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 justify-items-center border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
      <Button
        variant="ghost"
        onClick={onBack}
        aria-label="Back to the list"
        className="size-11"
      >
        <ArrowLeftIcon className="size-5" />
      </Button>
      {/* Previous is the article above in the list, Next the one below. */}
      <Button
        variant="ghost"
        onClick={onPrevious ?? undefined}
        disabled={onPrevious === null}
        aria-label="Previous article"
        className="size-11"
      >
        <ChevronUpIcon className="size-5" />
      </Button>
      <Button
        variant="ghost"
        onClick={onNext ?? undefined}
        disabled={onNext === null}
        aria-label="Next article"
        className="size-11"
      >
        <ChevronDownIcon className="size-5" />
      </Button>
      <Button
        variant="ghost"
        onClick={read ? onMarkUnread : onMarkRead}
        aria-label={read ? 'Mark unread' : 'Mark read'}
        className="size-11"
      >
        {read ? (
          <CircleDotIcon className="size-5" />
        ) : (
          <CheckIcon className="size-5" />
        )}
      </Button>
    </div>
  )
}
