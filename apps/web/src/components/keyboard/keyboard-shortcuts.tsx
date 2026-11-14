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
  belongsToTarget,
  createKeyParser,
  keyToken,
  SEQUENCE_TIMEOUT_MS,
} from './key-parser.ts'
import { BINDINGS, sequenceLabel, type Command } from './keymap.ts'

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
      // While the `?` overlay is open, only closing it does anything (Esc
      // closes a dialog by itself).
      if (document.querySelector('dialog[open]') !== null) {
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
          className="fixed right-4 bottom-4 z-40 rounded-md bg-neutral-900 px-2 py-1 font-mono text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {typed}
        </p>
      )}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </PageCommands.Provider>
  )
}

/** The `?` overlay: every binding, straight from the table. */
function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-label="Keyboard shortcuts"
      onClose={onClose}
      className="m-auto max-h-[85vh] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-0 text-neutral-900 backdrop:bg-black/40 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Close
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1 pr-3 font-normal">Keys</th>
              <th className="py-1 pr-3 font-normal">On a list</th>
              <th className="py-1 font-normal">With an article open</th>
            </tr>
          </thead>
          <tbody>
            {BINDINGS.map((binding) => (
              <tr
                key={binding.command}
                className="border-t border-neutral-100 dark:border-neutral-900"
              >
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {binding.sequences.map((sequence) => (
                    <kbd
                      key={sequenceLabel(sequence)}
                      className="mr-1 rounded border border-neutral-300 px-1.5 font-mono text-xs dark:border-neutral-700"
                    >
                      {sequenceLabel(sequence)}
                    </kbd>
                  ))}
                  {binding.counted === true && (
                    <span className="text-xs text-neutral-500">(count)</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">{binding.list}</td>
                <td className="py-1.5 text-neutral-600 dark:text-neutral-400">
                  {binding.article ?? 'Same'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  )
}
