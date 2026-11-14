import { BINDINGS, type Command } from '#/components/keyboard/keymap'

/** How long a count or a `g` waits for the next key. */
export const SEQUENCE_TIMEOUT_MS = 1000

const MAX_COUNT = 999

export type ParseResult =
  | {
      readonly kind: 'command'
      readonly command: Command
      readonly count: number
    }
  /** Waiting for more keys; `typed` is what is pending, for the hint. */
  | { readonly kind: 'pending'; readonly typed: string }
  | { readonly kind: 'none' }

interface Pending {
  readonly count: string
  readonly keys: readonly string[]
  readonly at: number
}

const EMPTY: Pending = { count: '', keys: [], at: 0 }

const SEQUENCES = BINDINGS.flatMap((binding) =>
  binding.sequences.map((sequence) => ({ binding, sequence }))
)

const matches = (sequence: readonly string[], keys: readonly string[]) =>
  sequence.length === keys.length &&
  sequence.every((token, i) => token === keys[i])

const startsWith = (sequence: readonly string[], keys: readonly string[]) =>
  sequence.length > keys.length &&
  keys.every((token, i) => token === sequence[i])

/**
 * Turns key tokens into commands: counts (`5j`), multi-key sequences
 * (`gg`, `ga`) and a timeout, so an unfinished sequence is dropped rather
 * than changing what a later key means.
 */
export const createKeyParser = (timeoutMs = SEQUENCE_TIMEOUT_MS) => {
  let pending = EMPTY

  const feed = (token: string, now: number): ParseResult => {
    if (now - pending.at > timeoutMs) pending = EMPTY

    const digit = /^[0-9]$/.test(token)

    // A count comes first: `0` only continues one (it isn't bound alone).
    if (
      digit &&
      pending.keys.length === 0 &&
      (token !== '0' || pending.count !== '')
    ) {
      pending = { ...pending, count: pending.count + token, at: now }

      return { kind: 'pending', typed: pending.count }
    }

    const keys = [...pending.keys, token]
    const exact = SEQUENCES.find(({ sequence }) => matches(sequence, keys))

    if (exact !== undefined) {
      const typed = Number(pending.count === '' ? '1' : pending.count)

      pending = EMPTY

      return {
        kind: 'command',
        command: exact.binding.command,
        count: exact.binding.counted === true ? Math.min(typed, MAX_COUNT) : 1,
      }
    }

    if (SEQUENCES.some(({ sequence }) => startsWith(sequence, keys))) {
      pending = { ...pending, keys, at: now }

      return { kind: 'pending', typed: pending.count + keys.join('') }
    }

    // A key that doesn't finish what was pending drops it and counts on its
    // own: `g` then `Ctrl-d` is `Ctrl-d`, never a swallowed key (which the
    // browser would then act on, e.g. bookmarking the page).
    if (pending.keys.length > 0 || pending.count !== '') {
      pending = EMPTY

      return feed(token, now)
    }

    return { kind: 'none' }
  }

  return { feed, reset: () => (pending = EMPTY) }
}

export interface KeyLike {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey?: boolean
  readonly isComposing?: boolean
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/**
 * The token a key press stands for, or null to leave it to the browser:
 * Cmd and Alt shortcuts, Ctrl with anything but `d` / `u`, bare modifier
 * presses, and keys typed while composing text.
 */
export const keyToken = (event: KeyLike): string | null => {
  if (event.isComposing === true) return null

  if (event.metaKey || event.altKey) return null

  if (MODIFIER_KEYS.has(event.key)) return null

  if (event.ctrlKey) {
    return event.key === 'd' || event.key === 'u' ? `Ctrl-${event.key}` : null
  }

  if (event.key === ' ') {
    return event.shiftKey === true ? 'Shift-Space' : 'Space'
  }

  return event.key
}

export interface TargetLike {
  readonly tagName: string
  readonly isContentEditable: boolean
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const ACTIVATING_TAGS = new Set(['BUTTON', 'A', 'SUMMARY'])

/**
 * Whether a key belongs to the element it was typed in: anything typed in
 * a field, and Enter or Space on a focused button or link (which activate
 * it), so a shortcut never fires on top.
 */
export const belongsToTarget = (key: string, target: TargetLike | null) => {
  if (target === null) return false

  if (TYPING_TAGS.has(target.tagName) || target.isContentEditable) return true

  return ACTIVATING_TAGS.has(target.tagName) && (key === 'Enter' || key === ' ')
}
