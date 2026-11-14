import { useState } from 'react'

import type { ArticleRow } from '@dusty/db'

import {
  markArticleUnread,
  markArticlesRead,
  undoMarkArticlesRead,
} from '../../server/articles.ts'
import {
  articles,
  idsAbove,
  isRead,
  withRead,
  type ReadOverrides,
} from './list-state.ts'

export type Notice =
  | {
      readonly kind: 'marked'
      readonly text: string
      readonly actionId: string
    }
  | { readonly kind: 'info'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }

/**
 * The state of one loaded list (one snapshot): which rows the server has
 * confirmed read, the last undoable action, and a notice to show. The page
 * only ever shows what the server said it saved.
 */
export function useUnreadList(rows: readonly ArticleRow[], snapshotAt: number) {
  const [overrides, setOverrides] = useState<ReadOverrides>(new Map())
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  // The latest mark action not yet undone, for `u` (even once its notice
  // is dismissed).
  const [lastActionId, setLastActionId] = useState<string | null>(null)

  const apply = (ids: readonly number[], read: boolean) =>
    setOverrides((current) => withRead(current, ids, read))

  /**
   * Run a write; on failure say so and change nothing on screen. `busy`
   * disables the row actions meanwhile; opening an article skips it, so
   * reading quickly (`J` / `K`) never greys out the list.
   */
  const attempt = async (
    work: () => Promise<void>,
    failure: string,
    options: { readonly busy: boolean } = { busy: true }
  ) => {
    if (options.busy) setBusy(true)

    try {
      await work()
    } catch {
      setNotice({ kind: 'error', text: `${failure} Nothing was changed.` })
    } finally {
      if (options.busy) setBusy(false)
    }
  }

  const markRead = (
    ids: readonly number[],
    snapshot: number | null,
    describe: (count: number) => string
  ) =>
    attempt(async () => {
      const { actionId, changed } = await markArticlesRead({
        data: { ids: [...ids], snapshotAt: snapshot },
      })

      apply(changed, true)

      if (changed.length === 0) {
        setNotice({ kind: 'info', text: 'Already read; nothing to change.' })

        return
      }

      setNotice({ kind: 'marked', text: describe(changed.length), actionId })
      setLastActionId(actionId)
    }, "Couldn't mark that read.")

  const undo = (actionId: string) =>
    attempt(async () => {
      const { restored } = await undoMarkArticlesRead({ data: { actionId } })

      apply(restored, false)
      setLastActionId((last) => (last === actionId ? null : last))
      setNotice({
        kind: 'info',
        text: `Undone: ${articles(restored.length)} unread again.`,
      })
    }, "Couldn't undo.")

  return {
    overrides,
    notice,
    busy,
    isRead: (id: number) => isRead(overrides, id),
    dismissNotice: () => setNotice(null),
    say: (text: string) => setNotice({ kind: 'info', text }),
    fail: (text: string) => setNotice({ kind: 'error', text }),

    markOneRead: (id: number) => markRead([id], null, () => 'Marked read.'),

    /** Opening an article reads it; quietly, unless it fails. */
    markOpenedRead: (id: number, alreadyRead: boolean) =>
      attempt(
        async () => {
          if (isRead(overrides, id)) return

          // Read before it was opened (say, from a link to an article not
          // in this list): the server said so; note it, so Mark unread and
          // `m` work on it.
          if (alreadyRead) {
            apply([id], true)

            return
          }

          const { changed } = await markArticlesRead({
            data: { ids: [id], snapshotAt: null },
          })

          apply(changed, true)
        },
        "Couldn't mark the article read.",
        { busy: false }
      ),

    markAllAbove: (chosenId: number) =>
      markRead(
        idsAbove(rows, chosenId),
        snapshotAt,
        (count) => `Marked ${articles(count)} above as read.`
      ),

    markOneUnread: (id: number) =>
      attempt(async () => {
        const { changed } = await markArticleUnread({ data: { id } })

        if (changed) apply([id], false)
        setNotice(null)
      }, "Couldn't mark that unread."),

    undo,

    /** Undo the latest mark action, if there is one left to undo. */
    undoLast: () => {
      if (lastActionId === null) {
        setNotice({ kind: 'info', text: 'Nothing to undo.' })

        return
      }

      void undo(lastActionId)
    },
  }
}
