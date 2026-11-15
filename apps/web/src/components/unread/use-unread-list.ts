import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { ArticleRow } from '@dusty/db'

import {
  markArticleUnread,
  markArticlesRead,
  undoMarkArticlesRead,
} from '#/server/articles'
import { articleQuery } from '#/lib/queries'
import {
  articles,
  idsAbove,
  isRead,
  readWhenLoaded,
  withRead,
  type ReadOverrides,
} from '#/components/unread/list-state'

export type Notice =
  | {
      readonly kind: 'marked'
      readonly text: string
      readonly actionId: string
    }
  | { readonly kind: 'info'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }

/** A mark-read action: the ids, its snapshot, and how to describe it. */
interface MarkRead {
  readonly ids: readonly number[]
  readonly snapshotAt: number | null
  readonly describe: (count: number) => string
}

/**
 * The state of one loaded list (one snapshot): which articles the server
 * has confirmed read, the last undoable action, and a notice to show. The
 * page only ever shows what the server said it saved, and asks only this
 * hook whether an article is read (`isRead`), the open one included.
 *
 * The writes are mutations; the row actions are disabled while any marking
 * one is in flight. Opening an article reads it without that, so reading
 * quickly (`j` / `k`) never greys out the list.
 */
export function useUnreadList(
  rows: readonly ArticleRow[],
  snapshotAt: number,
  /** The open article: it may not be one of these rows (opened by link). */
  openId: number | null
) {
  const queryClient = useQueryClient()
  // Local screen state, confirmed by the server: there is no other home.
  const [overrides, setOverrides] = useState<ReadOverrides>(new Map())
  const [notice, setNotice] = useState<Notice | null>(null)
  // The latest mark action not yet undone, for `u` (even once its notice
  // is dismissed).
  const [lastActionId, setLastActionId] = useState<string | null>(null)

  // Rows a feed's "all" list loaded already read (none in an unread list).
  // The page is keyed by the snapshot, so `rows` never change under this.
  const loadedRead = readWhenLoaded(rows)

  // The open article, for its read state when it isn't one of these rows.
  // The article view asks for the same query, so this costs no request.
  useQuery({ ...articleQuery(openId ?? 0), enabled: openId !== null })

  const listed = new Set(rows.map((row) => row.id))

  /**
   * A write confirmed: note it for this list, and in the cached article,
   * whose `readAt` is kept for good (`staleTime: Infinity`) and would
   * otherwise say the old state the next time it's shown.
   */
  const apply = (ids: readonly number[], read: boolean) => {
    setOverrides((current) => withRead(current, ids, read))

    const readAt = read ? Date.now() : null

    for (const id of ids) {
      queryClient.setQueryData(articleQuery(id).queryKey, (article) =>
        article ? { ...article, readAt } : article
      )
    }
  }

  const failed = (what: string) =>
    setNotice({ kind: 'error', text: `${what} Nothing was changed.` })

  const markRead = useMutation({
    mutationFn: (mark: MarkRead) =>
      markArticlesRead({
        data: { ids: [...mark.ids], snapshotAt: mark.snapshotAt },
      }),
    onSuccess: ({ actionId, changed }, mark) => {
      apply(changed, true)

      if (changed.length === 0) {
        setNotice({ kind: 'info', text: 'Already read; nothing to change.' })

        return
      }

      setNotice({
        kind: 'marked',
        text: mark.describe(changed.length),
        actionId,
      })
      setLastActionId(actionId)
    },
    onError: () => failed("Couldn't mark that read."),
  })

  /** Opening an article reads it; quietly, unless it fails. */
  const markOpened = useMutation({
    mutationFn: (id: number) =>
      markArticlesRead({ data: { ids: [id], snapshotAt: null } }),
    // Read either way: just now, or already (by another device, say).
    onSuccess: (_result, id) => apply([id], true),
    onError: () => failed("Couldn't mark the article read."),
  })

  const markUnread = useMutation({
    mutationFn: (id: number) => markArticleUnread({ data: { id } }),
    onSuccess: ({ changed }, id) => {
      if (changed) apply([id], false)
      setNotice(null)
    },
    onError: () => failed("Couldn't mark that unread."),
  })

  const undo = useMutation({
    mutationFn: (actionId: string) =>
      undoMarkArticlesRead({ data: { actionId } }),
    onSuccess: ({ restored }, actionId) => {
      apply(restored, false)
      setLastActionId((last) => (last === actionId ? null : last))
      setNotice({
        kind: 'info',
        text: `Undone: ${articles(restored.length)} unread again.`,
      })
    },
    onError: () => failed("Couldn't undo."),
  })

  /**
   * Whether an article is read now: as written since this list loaded,
   * else as the list loaded it, else (not one of its rows: opened by link)
   * as its cached article says.
   */
  const isReadNow = (id: number): boolean => {
    if (overrides.has(id) || listed.has(id)) {
      return isRead(overrides, id, loadedRead)
    }

    const cached = queryClient.getQueryData(articleQuery(id).queryKey)

    return (cached?.readAt ?? null) !== null
  }

  return {
    overrides,
    notice,
    busy: markRead.isPending || markUnread.isPending || undo.isPending,
    isRead: isReadNow,
    dismissNotice: () => setNotice(null),
    say: (text: string) => setNotice({ kind: 'info', text }),
    fail: (text: string) => setNotice({ kind: 'error', text }),

    markOneRead: (id: number) =>
      markRead.mutate({
        ids: [id],
        snapshotAt: null,
        describe: () => 'Marked read.',
      }),

    markOpenedRead: (id: number) => {
      if (!isReadNow(id)) markOpened.mutate(id)
    },

    markAllAbove: (chosenId: number) =>
      markRead.mutate({
        ids: idsAbove(rows, chosenId),
        snapshotAt,
        describe: (count) => `Marked ${articles(count)} above as read.`,
      }),

    markOneUnread: (id: number) => markUnread.mutate(id),

    undo: (actionId: string) => undo.mutate(actionId),

    /** Undo the latest mark action, if there is one left to undo. */
    undoLast: () => {
      if (lastActionId === null) {
        setNotice({ kind: 'info', text: 'Nothing to undo.' })

        return
      }

      undo.mutate(lastActionId)
    },
  }
}
