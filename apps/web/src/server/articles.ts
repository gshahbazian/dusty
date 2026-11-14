import { createServerFn } from '@tanstack/react-start'
import * as Schema from 'effect/Schema'

import {
  getArticle,
  LIST_LIMIT,
  listArticles,
  markRead,
  markUnread,
  undoMarkRead,
  unreadCounts,
} from '@dusty/db'

import { dbFor } from './db.ts'
import { ownerOnly } from './middleware.ts'

/** Most articles one mark-read action may name. */
const MAX_IDS = 20_000

/**
 * An article list (all unread, or one feed's unread or all) as a
 * snapshot: its rows, the counts that go with them, and the time it was
 * read. Marking all above sends `snapshotAt` back, so nothing that arrived
 * later is touched.
 */
export const getArticleList = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({
        feedId: Schema.NullOr(Schema.Int),
        show: Schema.Literals(['unread', 'all']),
      })
    )
  )
  .handler(async ({ context, data }) => {
    const db = dbFor(context.env)
    // Read the time first: the list and counts leave out anything stored
    // after it, which is exactly what "mark all above" will refuse.
    const snapshotAt = Date.now()

    const [rows, counts] = await Promise.all([
      listArticles(db, {
        feedId: data.feedId,
        seenBy: snapshotAt,
        show: data.show,
      }),
      unreadCounts(db, { seenBy: snapshotAt }),
    ])

    // Whether the list stopped at the limit: the page says so.
    return { rows, counts, snapshotAt, truncated: rows.length >= LIST_LIMIT }
  })

/** One article with its HTML, for reading. */
export const getArticleToRead = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(Schema.decodeUnknownSync(Schema.Struct({ id: Schema.Int })))
  .handler(({ context, data }) => getArticle(dbFor(context.env), data.id))

/**
 * Mark articles read as one undoable action: a single row, an opened
 * article, or every row above the chosen one. Returns the action's id and
 * exactly the articles it changed.
 */
export const markArticlesRead = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({
        ids: Schema.Array(Schema.Int).check(Schema.isMaxLength(MAX_IDS)),
        snapshotAt: Schema.NullOr(Schema.Int),
      })
    )
  )
  .handler(async ({ context, data }) => {
    const actionId = crypto.randomUUID()

    const changed = await markRead(dbFor(context.env), {
      ids: data.ids,
      snapshotAt: data.snapshotAt,
      actionId,
      now: Date.now(),
    })

    return { actionId, changed }
  })

/** Mark one article unread. */
export const markArticleUnread = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(Schema.decodeUnknownSync(Schema.Struct({ id: Schema.Int })))
  .handler(async ({ context, data }) => ({
    changed: await markUnread(dbFor(context.env), data.id),
  }))

/** Undo a mark-read action; returns the articles that are unread again. */
export const undoMarkArticlesRead = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({
        actionId: Schema.String.check(Schema.isMaxLength(64)),
      })
    )
  )
  .handler(async ({ context, data }) => ({
    restored: await undoMarkRead(dbFor(context.env), data.actionId),
  }))
