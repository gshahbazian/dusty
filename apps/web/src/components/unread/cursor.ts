/**
 * The cursor is an article id, so it names the same row whatever else
 * changes. These turn it into a position and back.
 */

/**
 * Where the cursor is in this list: on its article if the list has it,
 * else the top (after a refresh drops it, or before anything is chosen).
 * -1 for an empty list.
 */
export const cursorIndex = (
  rows: readonly { readonly id: number }[],
  cursorId: number | null
): number => {
  if (rows.length === 0) return -1

  const index = rows.findIndex((row) => row.id === cursorId)

  return index === -1 ? 0 : index
}

/** Move by `delta` rows, stopping at the ends. */
export const moveCursor = (index: number, delta: number, length: number) =>
  Math.min(Math.max(index + delta, 0), length - 1)

/**
 * The feed after (or before) the current one in the sidebar's order: all
 * unread (null) first, then each feed. Undefined at either end.
 */
export const neighborFeed = (
  order: readonly (number | null)[],
  current: number | null,
  direction: 1 | -1
): number | null | undefined => {
  const index = order.indexOf(current)

  if (index === -1) return undefined

  const next = index + direction

  if (next < 0 || next >= order.length) return undefined

  return order[next]
}
