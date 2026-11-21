import { desc, eq, lt } from 'drizzle-orm'

import type { Db } from '#/client'
import { dailyBackdrops } from '#/schema'

/** A day's photo for the empty article pane, with its credit. */
export interface DailyBackdrop {
  readonly imageUrl: string
  readonly alt: string
  readonly color: string | null
  readonly photographerName: string
  readonly photographerUrl: string
  readonly photoUrl: string
}

const backdropColumns = {
  imageUrl: dailyBackdrops.imageUrl,
  alt: dailyBackdrops.alt,
  color: dailyBackdrops.color,
  photographerName: dailyBackdrops.photographerName,
  photographerUrl: dailyBackdrops.photographerUrl,
  photoUrl: dailyBackdrops.photoUrl,
}

/** The photo kept for `day` (YYYY-MM-DD), if one was fetched already. */
export const getDailyBackdrop = async (
  db: Db,
  day: string
): Promise<DailyBackdrop | null> => {
  const [row] = await db
    .select(backdropColumns)
    .from(dailyBackdrops)
    .where(eq(dailyBackdrops.day, day))

  return row ?? null
}

/**
 * The newest photo kept, whatever its day: shown when Unsplash can't be
 * asked for today's, so a failure still shows a credited photo. Earlier
 * days are only deleted when a new day's photo is saved, so yesterday's
 * stays until then.
 */
export const getLatestBackdrop = async (
  db: Db
): Promise<DailyBackdrop | null> => {
  const [row] = await db
    .select(backdropColumns)
    .from(dailyBackdrops)
    .orderBy(desc(dailyBackdrops.day))
    .limit(1)

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
