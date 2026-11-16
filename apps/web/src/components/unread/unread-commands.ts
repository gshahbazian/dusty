import type { ArticleRow } from '@dusty/db'

import type { Command } from '#/components/keyboard/keymap'
import { moveCursor } from '#/components/unread/cursor'

/**
 * The unread page's keyboard commands, and Previous / Next for an open
 * article, as plain functions of the page's state: unit tested in
 * `test/unread-commands.test.ts`.
 */

/** How far the arrow keys scroll an open article, per press. */
const ARTICLE_STEP_PX = 64

/**
 * Previous and Next for an open article, as `k` / `j` do: the rows either
 * side of it, or, if it isn't in the list (opened from a link), the top row
 * as next and nothing as previous.
 */
export interface Neighbors {
  readonly previous: (() => void) | null
  readonly next: (() => void) | null
}

export function articleNeighbors(
  rows: readonly ArticleRow[],
  cursor: number,
  openId: number | null,
  open: (index: number) => void
): Neighbors {
  if (openId === null || rows.length === 0) {
    return { previous: null, next: null }
  }

  if (rows[cursor]?.id !== openId) {
    return { previous: null, next: () => open(0) }
  }

  return {
    previous: cursor > 0 ? () => open(cursor - 1) : null,
    next: cursor < rows.length - 1 ? () => open(cursor + 1) : null,
  }
}

/** What the commands use of the list (`useUnreadList`). */
export interface CommandList {
  readonly busy: boolean
  readonly isRead: (id: number) => boolean
  readonly say: (text: string) => void
  readonly undoLast: () => void
  readonly markOneRead: (id: number) => void
  readonly markOneUnread: (id: number) => void
  readonly markAllAbove: (id: number) => void
}

export type Commands = Partial<Record<Command, (count: number) => void>>

/** What each command does on this list, given where the cursor is. */
export function commandsFor(page: {
  rows: readonly ArticleRow[]
  cursor: number
  /** The open article, if any: `m` acts on it (it may not be in the list). */
  openId: number | null
  list: CommandList
  moveTo: (index: number) => void
  open: (index: number) => void
  refresh: () => void
  /** Reload the list from what is stored, without a sync. */
  showNewArticles: () => void
  close: () => void
  goToFeed: (direction: 1 | -1) => void
  scrollArticle: (pixels: number) => void
  articleHeight: () => number
  halfPage: (direction: 1 | -1) => void
  /** Open a page in a new tab (the original, for `o`). */
  openUrl: (url: string) => void
}): Commands {
  const { rows, cursor, list } = page
  const articleOpen = page.openId !== null
  const row = rows[cursor]

  const always: Commands = {
    refresh: page.refresh,
    showNewArticles: page.showNewArticles,
    undo: list.undoLast,
    nextFeed: () => page.goToFeed(1),
    previousFeed: () => page.goToFeed(-1),
    ...(articleOpen && { close: page.close }),
  }

  if (row === undefined) return always

  /** Arrow keys: scroll an open article, else move the cursor. */
  const scroll = (delta: number) => {
    if (articleOpen) {
      page.scrollArticle(ARTICLE_STEP_PX * delta)

      return
    }

    page.moveTo(moveCursor(cursor, delta, rows.length))
  }

  /**
   * `j` / `k`: move the cursor; with an article open, open the next (or
   * previous) one in its place. If the open article isn't in the list
   * (opened from a link), `j` starts at the top and `k` has nowhere to go.
   */
  const step = (delta: number) => {
    if (articleOpen && row.id !== page.openId) {
      if (delta > 0) page.open(0)

      return
    }

    const index = moveCursor(cursor, delta, rows.length)

    if (articleOpen) {
      page.open(index)

      return
    }

    page.moveTo(index)
  }

  /**
   * Marking waits for the last write to finish, as the row buttons do, so
   * `u` can't undo an earlier action while a later one is still saving.
   */
  const whenIdle = (write: () => void) => () => {
    if (!list.busy) write()
  }

  /**
   * `Ctrl-d` / `Ctrl-u` (half a page) and Space / Shift-Space (most of a
   * page) scroll an open article; on the list, both move half a page.
   */
  const pageBy = (direction: 1 | -1, share: number) => {
    if (articleOpen) {
      page.scrollArticle(page.articleHeight() * share * direction)

      return
    }

    page.halfPage(direction)
  }

  return {
    ...always,
    down: (count) => step(count),
    up: (count) => step(-count),
    scrollDown: (count) => scroll(count),
    scrollUp: (count) => scroll(-count),
    first: () => page.moveTo(0),
    last: () => page.moveTo(rows.length - 1),
    halfPageDown: () => pageBy(1, 0.5),
    halfPageUp: () => pageBy(-1, 0.5),
    pageDown: () => pageBy(1, 0.9),
    pageUp: () => pageBy(-1, 0.9),
    open: () => page.open(cursor),
    openOriginal: () => {
      if (row.url === null) {
        list.say('This article has no original page.')

        return
      }

      page.openUrl(row.url)
    },
    undo: whenIdle(list.undoLast),
    toggleRead: whenIdle(() => {
      const id = page.openId ?? row.id

      if (list.isRead(id)) {
        list.markOneUnread(id)

        return
      }

      list.markOneRead(id)
    }),
    markAllAbove: whenIdle(() => {
      if (cursor === 0) {
        list.say('Nothing above this row.')

        return
      }

      list.markAllAbove(row.id)
    }),
  }
}
