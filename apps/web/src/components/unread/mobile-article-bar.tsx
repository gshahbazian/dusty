import { Button } from '@/components/ui/button.tsx'

/**
 * Phones only: the open article's actions in a bar at the bottom of the
 * screen, within thumb reach (clear of the home indicator). On a phone the
 * article replaces the list, so this is the way back, and Previous, Next and
 * Mark unread are the touch versions of `k`, `j` and `m`. On a wide screen
 * the list stays beside the article and the keys do all of it, so the bar
 * is hidden.
 */
export function MobileArticleBar({
  read,
  onBack,
  onPrevious,
  onNext,
  onMarkUnread,
}: {
  read: boolean
  onBack: () => void
  /** The previous and next article in the list (null at either end). */
  onPrevious: (() => void) | null
  onNext: (() => void) | null
  onMarkUnread: () => void
}) {
  return (
    <div className="bg-background fixed inset-x-0 bottom-0 z-20 flex items-center gap-1 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
      <Button variant="ghost" onClick={onBack}>
        ← Back to the list
      </Button>
      <Button
        variant="ghost"
        onClick={onPrevious ?? undefined}
        disabled={onPrevious === null}
        aria-label="Previous article"
      >
        Previous
      </Button>
      <Button
        variant="ghost"
        onClick={onNext ?? undefined}
        disabled={onNext === null}
        aria-label="Next article"
      >
        Next
      </Button>
      {read && (
        <Button variant="outline" onClick={onMarkUnread} className="ml-auto">
          Mark unread
        </Button>
      )}
    </div>
  )
}
