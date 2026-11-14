import { useNavigate } from '@tanstack/react-router'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

import {
  belongsToTarget,
  createKeyParser,
  keyToken,
  SEQUENCE_TIMEOUT_MS,
} from '#/components/keyboard/key-parser'
import {
  BINDINGS,
  sequenceLabel,
  type Command,
} from '#/components/keyboard/keymap'

/** A page's commands. Returns whether it did something with the key. */
export type CommandHandler = (command: Command, count: number) => boolean

/** Sets the page's handler; returns a function that removes it. */
type Register = (handler: CommandHandler) => () => void

const PageCommands = createContext<Register | null>(null)

/**
 * Let the current page handle commands (moving the cursor, marking). The
 * latest handler is used on every key, so it always sees current state.
 */
export function useCommands(handler: CommandHandler) {
  const register = useContext(PageCommands)
  const latest = useRef(handler)

  useEffect(() => {
    latest.current = handler
  })

  useEffect(() => {
    if (register === null) return

    return register((command, count) => latest.current(command, count))
  }, [register])
}

/**
 * The app's keyboard: one listener for the whole page. Going to a page and
 * the `?` overlay work everywhere; everything else goes to the page.
 */
export function KeyboardShortcuts({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const page = useRef<CommandHandler | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [typed, setTyped] = useState('')

  const [register] = useState(() => {
    const set: Register = (handler) => {
      page.current = handler

      return () => {
        if (page.current === handler) page.current = null
      }
    }

    return set
  })

  useEffect(() => {
    const parser = createKeyParser()
    let clearHint: ReturnType<typeof setTimeout> | undefined

    const showPending = (keys: string) => {
      clearTimeout(clearHint)
      setTyped(keys)

      if (keys !== '') {
        clearHint = setTimeout(() => setTyped(''), SEQUENCE_TIMEOUT_MS)
      }
    }

    const run = (command: Command, count: number): boolean => {
      if (command === 'help') {
        setHelpOpen(true)

        return true
      }

      if (command === 'goToAllUnread') {
        void navigate({ to: '/' })

        return true
      }

      if (command === 'goToSettings') {
        void navigate({ to: '/settings' })

        return true
      }

      return page.current?.(command, count) ?? false
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // While a dialog (the `?` overlay) or a menu (a row's right-click
      // menu) is open, keys are its own: Esc closes it, not the article.
      if (document.querySelector('[role="dialog"], [role="menu"]') !== null) {
        if (event.key === 'q' || event.key === '?') setHelpOpen(false)

        return
      }

      const token = keyToken(event)

      if (token === null) return

      const target = event.target instanceof HTMLElement ? event.target : null

      if (belongsToTarget(event.key, target)) return

      const result = parser.feed(token, event.timeStamp)

      if (result.kind === 'pending') {
        event.preventDefault()
        showPending(result.typed)

        return
      }

      showPending('')

      if (result.kind === 'none') return

      if (run(result.command, result.count)) event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      clearTimeout(clearHint)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [navigate])

  return (
    <PageCommands.Provider value={register}>
      {children}
      {typed !== '' && (
        <p
          aria-hidden="true"
          className="bg-primary text-primary-foreground fixed right-4 bottom-4 z-40 px-2 py-1 font-mono text-sm"
        >
          {typed}
        </p>
      )}
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </PageCommands.Provider>
  )
}

/** The `?` overlay: every binding, straight from the table. */
function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1 pr-3 font-normal">Keys</th>
              <th className="py-1 pr-3 font-normal">On a list</th>
              <th className="py-1 font-normal">With an article open</th>
            </tr>
          </thead>
          <tbody>
            {BINDINGS.map((binding) => (
              <tr key={binding.command} className="border-t">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {binding.sequences.map((sequence) => (
                    <kbd
                      key={sequenceLabel(sequence)}
                      className="mr-1 border px-1.5 font-mono"
                    >
                      {sequenceLabel(sequence)}
                    </kbd>
                  ))}
                  {binding.counted === true && (
                    <span className="text-muted-foreground">(count)</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">{binding.list}</td>
                <td className="text-muted-foreground py-1.5">
                  {binding.article ?? 'Same'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  )
}
