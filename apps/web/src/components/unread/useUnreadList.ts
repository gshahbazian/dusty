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

  /** Run a write; on failure say so and change nothing on screen. */
  const attempt = async (work: () => Promise<void>, failure: string) => {
    setBusy(true)

    try {
      await work()
    } catch {
      setNotice({ kind: 'error', text: `${failure} Nothing was changed.` })
    } finally {
      setBusy(false)
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

    markOneRead: (id: number) => markRead([id], null, () => 'Marked read.'),

    /** Opening an article reads it; quietly, unless it fails. */
    markOpenedRead: (id: number) =>
      attempt(async () => {
        if (isRead(overrides, id)) return

        const { changed } = await markArticlesRead({
          data: { ids: [id], snapshotAt: null },
        })

        apply(changed, true)
      }, "Couldn't mark the article read."),

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
