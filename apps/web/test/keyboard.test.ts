import { describe, expect, test } from 'vitest'

import {
  belongsToTarget,
  createKeyParser,
  keyToken,
  SEQUENCE_TIMEOUT_MS,
} from '../src/components/keyboard/key-parser.ts'
import { BINDINGS, sequenceLabel } from '../src/components/keyboard/keymap.ts'
import {
  cursorIndex,
  feedFromPath,
  moveCursor,
  neighborFeed,
} from '../src/components/unread/cursor.ts'

/** Feed keys one per millisecond; returns the last result. */
const type = (keys: readonly string[], start = 0) => {
  const parser = createKeyParser()

  return keys.map((key, i) => parser.feed(key, start + i)).at(-1)
}

describe('key parser', () => {
  test('single keys are commands with a count of 1', () => {
    expect(type(['j'])).toEqual({ kind: 'command', command: 'down', count: 1 })
    expect(type(['A'])).toEqual({
      kind: 'command',
      command: 'markAllAbove',
      count: 1,
    })
    expect(type(['Ctrl-d'])).toEqual({
      kind: 'command',
      command: 'halfPageDown',
      count: 1,
    })
  })

  test('a count applies to the keys that take one', () => {
    expect(type(['5', 'j'])).toEqual({
      kind: 'command',
      command: 'down',
      count: 5,
    })
    expect(type(['1', '2', 'k'])).toEqual({
      kind: 'command',
      command: 'up',
      count: 12,
    })
  })

  test('a count is ignored by keys that take none, and capped', () => {
    expect(type(['3', 'A'])).toMatchObject({
      command: 'markAllAbove',
      count: 1,
    })
    expect(type(['9', '9', '9', '9', 'j'])).toMatchObject({ count: 999 })
  })

  test('0 on its own is not a count', () => {
    expect(type(['0'])).toEqual({ kind: 'none' })
    expect(type(['1', '0', 'j'])).toMatchObject({ count: 10 })
  })

  test('multi-key sequences wait, then complete', () => {
    const parser = createKeyParser()

    expect(parser.feed('g', 0)).toEqual({ kind: 'pending', typed: 'g' })
    expect(parser.feed('g', 10)).toMatchObject({ command: 'first' })
    expect(type(['g', 'a'])).toMatchObject({ command: 'goToAllUnread' })
    expect(type(['g', 's'])).toMatchObject({ command: 'goToSettings' })
  })

  test('the hint shows the count and keys pending', () => {
    expect(type(['5', 'g'])).toEqual({ kind: 'pending', typed: '5g' })
  })

  test('an unfinished sequence times out cleanly', () => {
    const parser = createKeyParser()

    parser.feed('g', 0)

    // Too late for `gg`: the first `g` is dropped and this one starts over.
    expect(parser.feed('g', SEQUENCE_TIMEOUT_MS + 1)).toEqual({
      kind: 'pending',
      typed: 'g',
    })

    parser.feed('5', 5000)

    // A stale count doesn't turn a later `j` into `5j`.
    expect(parser.feed('j', 5000 + SEQUENCE_TIMEOUT_MS + 1)).toMatchObject({
      command: 'down',
      count: 1,
    })
  })

  test('an unknown key does nothing, and leaves nothing pending', () => {
    expect(type(['x'])).toEqual({ kind: 'none' })
    expect(type(['g', 'x'])).toEqual({ kind: 'none' })

    const parser = createKeyParser()

    parser.feed('g', 0)
    parser.feed('x', 1)
    expect(parser.feed('a', 2)).toEqual({ kind: 'none' })
  })

  test('a key that breaks a sequence counts on its own', () => {
    // Never swallowed: the browser would act on it instead.
    expect(type(['g', 'Ctrl-d'])).toEqual({
      kind: 'command',
      command: 'halfPageDown',
      count: 1,
    })
    expect(type(['g', 'j'])).toMatchObject({ command: 'down', count: 1 })
    expect(type(['5', 'g', 'G'])).toMatchObject({ command: 'last' })
  })

  test('every binding in the table reaches its command', () => {
    for (const binding of BINDINGS) {
      for (const sequence of binding.sequences) {
        expect(type(sequence), sequenceLabel(sequence)).toMatchObject({
          kind: 'command',
          command: binding.command,
        })
      }
    }
  })

  test('no two bindings share a sequence', () => {
    const labels = BINDINGS.flatMap((binding) =>
      binding.sequences.map(sequenceLabel)
    )

    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('which keys are ours', () => {
  const key = (
    k: string,
    mods: Partial<Record<'ctrl' | 'meta' | 'alt', boolean>> = {}
  ) => ({
    key: k,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
  })

  test('plain keys, Space and Ctrl-d / Ctrl-u', () => {
    expect(keyToken(key('j'))).toBe('j')
    expect(keyToken(key(' '))).toBe('Space')
    expect(keyToken({ ...key(' '), shiftKey: true })).toBe('Shift-Space')
    expect(keyToken(key('ArrowDown'))).toBe('ArrowDown')
    expect(keyToken(key('G'))).toBe('G')
    expect(keyToken(key('d', { ctrl: true }))).toBe('Ctrl-d')
  })

  test('browser and system shortcuts are left alone', () => {
    expect(keyToken(key('r', { meta: true }))).toBeNull()
    expect(keyToken(key('j', { alt: true }))).toBeNull()
    expect(keyToken(key('r', { ctrl: true }))).toBeNull()
    expect(keyToken(key('Shift'))).toBeNull()
    expect(keyToken({ ...key('j'), isComposing: true })).toBeNull()
  })

  const element = (tagName: string, isContentEditable = false) => ({
    tagName,
    isContentEditable,
  })

  test('typing in a field never fires a shortcut', () => {
    expect(belongsToTarget('j', element('INPUT'))).toBe(true)
    expect(belongsToTarget('A', element('TEXTAREA'))).toBe(true)
    expect(belongsToTarget('j', element('SELECT'))).toBe(true)
    expect(belongsToTarget('j', element('DIV', true))).toBe(true)
  })

  test('Enter and Space activate a focused button instead', () => {
    expect(belongsToTarget('Enter', element('BUTTON'))).toBe(true)
    expect(belongsToTarget(' ', element('A'))).toBe(true)
    expect(belongsToTarget('j', element('BUTTON'))).toBe(false)
    expect(belongsToTarget('Enter', element('BODY'))).toBe(false)
    expect(belongsToTarget('j', null)).toBe(false)
  })
})

describe('cursor', () => {
  const rows = [{ id: 10 }, { id: 11 }, { id: 12 }]

  test('sits on its article, or the top if the list lost it', () => {
    expect(cursorIndex(rows, 12)).toBe(2)
    expect(cursorIndex(rows, 99)).toBe(0)
    expect(cursorIndex(rows, null)).toBe(0)
    expect(cursorIndex([], 10)).toBe(-1)
  })

  test('moves stop at the ends', () => {
    expect(moveCursor(0, 1, 3)).toBe(1)
    expect(moveCursor(1, 50, 3)).toBe(2)
    expect(moveCursor(1, -50, 3)).toBe(0)
  })

  test('the list a path shows', () => {
    expect(feedFromPath('/feeds/12')).toBe(12)
    expect(feedFromPath('/')).toBeNull()
    expect(feedFromPath('/settings')).toBeNull()
  })

  test('] and [ walk the sidebar and stop at the ends', () => {
    const order = [null, 4, 7]

    expect(neighborFeed(order, null, 1)).toBe(4)
    expect(neighborFeed(order, 4, 1)).toBe(7)
    expect(neighborFeed(order, 7, 1)).toBeUndefined()
    expect(neighborFeed(order, 4, -1)).toBeNull()
    expect(neighborFeed(order, null, -1)).toBeUndefined()
  })
})
