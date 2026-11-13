import { createServerFn } from '@tanstack/react-start'
import * as Schema from 'effect/Schema'

import {
  createDb,
  getArticle,
  listUnread,
  markRead,
  markUnread,
  undoMarkRead,
  unreadCounts,
} from '@dusty/db'

import { ownerOnly } from './middleware.ts'

/** Most articles one mark-read action may name. */
const MAX_IDS = 20_000

/**
 * An unread list (global, or one feed's) as a snapshot: its rows, the
 * counts that go with them, and the time it was read. Marking all above
 * sends `snapshotAt` back, so nothing that arrived later is touched.
 */
export const getUnreadList = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(
    Schema.decodeUnknownSync(
      Schema.Struct({ feedId: Schema.NullOr(Schema.Int) })
    )
  )
  .handler(async ({ context, data }) => {
    const db = createDb(context.env.DB)
    // Read the time first: anything stored after it is not in this list.
    const snapshotAt = Date.now()

    const [rows, counts] = await Promise.all([
      listUnread(db, { feedId: data.feedId }),
      unreadCounts(db),
    ])

    return { rows, counts, snapshotAt }
  })

/** One article with its HTML, for reading. */
export const getArticleToRead = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(Schema.decodeUnknownSync(Schema.Struct({ id: Schema.Int })))
  .handler(({ context, data }) => getArticle(createDb(context.env.DB), data.id))

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

    const changed = await markRead(createDb(context.env.DB), {
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
    changed: await markUnread(createDb(context.env.DB), data.id),
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
    restored: await undoMarkRead(createDb(context.env.DB), data.actionId),
  }))
