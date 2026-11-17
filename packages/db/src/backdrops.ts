import { eq, lt } from 'drizzle-orm'

import type { Db } from '#/client'
import { dailyBackdrops } from '#/schema'

/** A day's photo for the empty article pane. */
export interface DailyBackdrop {
  readonly imageUrl: string
  readonly alt: string
  readonly color: string | null
}

/** The photo kept for `day` (YYYY-MM-DD), if one was fetched already. */
export const getDailyBackdrop = async (
  db: Db,
  day: string
): Promise<DailyBackdrop | null> => {
  const [row] = await db
    .select({
      imageUrl: dailyBackdrops.imageUrl,
      alt: dailyBackdrops.alt,
      color: dailyBackdrops.color,
    })
    .from(dailyBackdrops)
    .where(eq(dailyBackdrops.day, day))

  return row ?? null
}

/**
 * Keep `backdrop` as `day`'s photo, unless that day has one already: two
 * panes asking at once both fetch, but the first stored wins, and both get
 * it back, so the day still has one photo.
 *
 * Earlier days are deleted as it is saved, so the table holds about one
 * row. Only earlier ones: a tab left open since yesterday may still ask
 * for yesterday, and must not delete today's photo when it does.
 */
export const saveDailyBackdrop = async (
  db: Db,
  day: string,
  backdrop: DailyBackdrop,
  now: number
): Promise<DailyBackdrop> => {
  await db
    .insert(dailyBackdrops)
    .values({ day, ...backdrop, fetchedAt: now })
    .onConflictDoNothing()

  // ISO dates sort as text, so `<` is "before".
  await db.delete(dailyBackdrops).where(lt(dailyBackdrops.day, day))

  return (await getDailyBackdrop(db, day)) ?? backdrop
}
