import { cn } from 'cn'
import { XIcon } from 'lucide-react'

import { Button } from '#/components/ui/button'

import type { Notice } from '#/components/unread/use-unread-list'

/** Marked, undone or failed: a toast, so it never moves the list. */
export function NoticeBar({
  aboveBar,
  notice,
  busy,
  onUndo,
  onDismiss,
}: {
  /** An article's action bar is at the bottom of a phone's screen. */
  aboveBar: boolean
  notice: Notice | null
  busy: boolean
  onUndo: (actionId: string) => void
  onDismiss: () => void
}) {
  if (notice === null) return <output aria-live="polite" className="sr-only" />

  return (
    <output
      aria-live="polite"
      className={cn(
        'bg-popover text-popover-foreground fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 border py-1 pr-1 pl-3 text-xs shadow-md',
        aboveBar && 'max-lg:bottom-24',
        notice.kind === 'error' && 'border-destructive/50 text-destructive'
      )}
    >
      <span className="flex-1">{notice.text}</span>
      {notice.kind === 'marked' && (
        <Button
          variant="link"
          size="sm"
          onClick={() => onUndo(notice.actionId)}
          disabled={busy}
        >
          Undo
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-muted-foreground pointer-coarse:min-w-11"
      >
        <XIcon />
      </Button>
    </output>
  )
}
