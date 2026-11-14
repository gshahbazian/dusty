import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: Error
}> {
  /**
   * The whole cause chain, e.g. drizzle's "Failed query: ..." followed by
   * D1's own error. The first message alone rarely says what went wrong.
   */
  get detail(): string {
    const messages: string[] = []
    let current: unknown = this.cause

    while (current instanceof Error && messages.length < 5) {
      messages.push(current.message)
      current = current.cause
    }

    return messages.join(' <- ')
  }
}

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
