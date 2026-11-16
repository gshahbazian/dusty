import { describe, expect, test } from 'vitest'

import type { ArticleRow } from '@dusty/db'

import {
  articleNeighbors,
  commandsFor,
} from '#/components/unread/unread-commands'

const row = (id: number, url: string | null = `https://a.test/${id}`) =>
  ({
    id,
    feedId: 1,
    feedTitle: 'Feed',
    title: `Article ${id}`,
    url,
    excerpt: null,
    publishedAt: id,
    readAt: null,
  }) satisfies ArticleRow

const rows = [row(10), row(11), row(12, null), row(13)]

/** A page whose every action is recorded, as `name(args)`. */
const setup = (state: {
  cursor?: number
  openId?: number | null
  read?: readonly number[]
  busy?: boolean
  rows?: readonly ArticleRow[]
}) => {
  const calls: string[] = []

  const record = (name: string) => (value: number | string) =>
    calls.push(`${name}(${value})`)

  /** For actions that take nothing (a key's count is ignored). */
  const called = (name: string) => () => calls.push(name)

  const commands = commandsFor({
    rows: state.rows ?? rows,
    cursor: state.cursor ?? 0,
    openId: state.openId ?? null,
    list: {
      busy: state.busy ?? false,
      isRead: (id) => (state.read ?? []).includes(id),
      say: record('say'),
      undoLast: called('undoLast'),
      markOneRead: record('markOneRead'),
      markOneUnread: record('markOneUnread'),
      markAllAbove: record('markAllAbove'),
    },
    moveTo: record('moveTo'),
    open: record('open'),
    refresh: called('refresh'),
    showNewArticles: called('showNewArticles'),
    close: called('close'),
    goToFeed: record('goToFeed'),
    scrollArticle: record('scrollArticle'),
    articleHeight: () => 1000,
    halfPage: record('halfPage'),
    openUrl: record('openUrl'),
  })

  return { commands, calls }
}

describe('moving on the list', () => {
  test('j / k move the cursor, by a count, stopping at either end', () => {
    const { commands, calls } = setup({ cursor: 1 })

    commands.down?.(1)
    commands.down?.(5)
    commands.up?.(1)
    commands.up?.(9)
    expect(calls).toEqual(['moveTo(2)', 'moveTo(3)', 'moveTo(0)', 'moveTo(0)'])
  })

  test('arrows move the cursor; gg / G go to the ends; Enter opens', () => {
    const { commands, calls } = setup({ cursor: 2 })

    commands.scrollDown?.(1)
    commands.scrollUp?.(2)
    commands.first?.(1)
    commands.last?.(1)
    commands.open?.(1)
    expect(calls).toEqual([
      'moveTo(3)',
      'moveTo(0)',
      'moveTo(0)',
      'moveTo(3)',
      'open(2)',
    ])
  })

  test('Space and Ctrl-d / Ctrl-u move the list half a page', () => {
    const { commands, calls } = setup({})

    commands.pageDown?.(1)
    commands.halfPageUp?.(1)
    expect(calls).toEqual(['halfPage(1)', 'halfPage(-1)'])
  })
})

describe('with an article open', () => {
  test('j / k open the next and previous article in its place', () => {
    const { commands, calls } = setup({ cursor: 1, openId: 11 })

    commands.down?.(1)
    commands.up?.(1)
    expect(calls).toEqual(['open(2)', 'open(0)'])
  })

  test('opened from a link (not in the list): j starts at the top, k does nothing', () => {
    const { commands, calls } = setup({ cursor: 0, openId: 99 })

    commands.up?.(1)
    commands.down?.(1)
    expect(calls).toEqual(['open(0)'])
  })

  test('arrows and Space scroll the article; Esc closes it', () => {
    const { commands, calls } = setup({ openId: 10 })

    commands.scrollDown?.(2)
    commands.pageDown?.(1)
    commands.halfPageUp?.(1)
    commands.close?.(1)
    expect(calls).toEqual([
      'scrollArticle(128)',
      'scrollArticle(900)',
      'scrollArticle(-500)',
      'close',
    ])
  })

  test('Esc does nothing with no article open', () => {
    expect(setup({}).commands.close).toBeUndefined()
  })
})

describe('marking', () => {
  test('m marks the cursor row read, or unread when it already is', () => {
    const unread = setup({ cursor: 1 })
    const read = setup({ cursor: 1, read: [11] })

    unread.commands.toggleRead?.(1)
    read.commands.toggleRead?.(1)
    expect([...unread.calls, ...read.calls]).toEqual([
      'markOneRead(11)',
      'markOneUnread(11)',
    ])
  })

  test('m acts on the open article, even one not in the list', () => {
    const { commands, calls } = setup({ cursor: 0, openId: 99, read: [99] })

    commands.toggleRead?.(1)
    expect(calls).toEqual(['markOneUnread(99)'])
  })

  test('A marks everything above the cursor row; the top row has none', () => {
    const below = setup({ cursor: 2 })
    const top = setup({ cursor: 0 })

    below.commands.markAllAbove?.(1)
    top.commands.markAllAbove?.(1)
    expect([...below.calls, ...top.calls]).toEqual([
      'markAllAbove(12)',
      'say(Nothing above this row.)',
    ])
  })

  test('m, A and u wait while a write is in flight', () => {
    const { commands, calls } = setup({ cursor: 2, busy: true })

    commands.toggleRead?.(1)
    commands.markAllAbove?.(1)
    commands.undo?.(1)
    expect(calls).toEqual([])
  })

  test('u undoes the last action', () => {
    const { commands, calls } = setup({})

    commands.undo?.(1)
    expect(calls).toEqual(['undoLast'])
  })
})

describe('everything else', () => {
  test('o opens the original page, or says there is none', () => {
    const withUrl = setup({ cursor: 0 })
    const withoutUrl = setup({ cursor: 2 })

    withUrl.commands.openOriginal?.(1)
    withoutUrl.commands.openOriginal?.(1)
    expect([...withUrl.calls, ...withoutUrl.calls]).toEqual([
      'openUrl(https://a.test/10)',
      'say(This article has no original page.)',
    ])
  })

  test('r, R, ] and [ work on an empty list; row commands do not', () => {
    const { commands, calls } = setup({ rows: [], cursor: -1 })

    commands.refresh?.(1)
    commands.showNewArticles?.(1)
    commands.nextFeed?.(1)
    commands.previousFeed?.(1)
    expect(calls).toEqual([
      'refresh',
      'showNewArticles',
      'goToFeed(1)',
      'goToFeed(-1)',
    ])
    expect(commands.down).toBeUndefined()
    expect(commands.toggleRead).toBeUndefined()
  })
})

describe('Previous and Next for an open article', () => {
  const opened: number[] = []
  const open = (index: number) => opened.push(index)

  test('none with no article open', () => {
    expect(articleNeighbors(rows, 0, null, open)).toEqual({
      previous: null,
      next: null,
    })
  })

  test('the rows either side, and none past the ends', () => {
    const middle = articleNeighbors(rows, 1, 11, open)
    const first = articleNeighbors(rows, 0, 10, open)
    const last = articleNeighbors(rows, 3, 13, open)

    middle.previous?.()
    middle.next?.()
    expect(opened).toEqual([0, 2])
    expect(first.previous).toBeNull()
    expect(last.next).toBeNull()
  })

  test('opened from a link: Next starts at the top, no Previous', () => {
    const neighbors = articleNeighbors(rows, 0, 99, open)

    expect(neighbors.previous).toBeNull()
    neighbors.next?.()
    expect(opened.at(-1)).toBe(0)
  })
})
