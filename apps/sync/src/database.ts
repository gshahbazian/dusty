import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: Error
}> {}

/** Run one database call as an Effect, traced as `db.<operation>`. */
export const query = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new DatabaseError({
        operation,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      }),
  }).pipe(Effect.withSpan(`db.${operation}`))
