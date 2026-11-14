/**
 * Retry D1 calls that fail with SQLITE_BUSY.
 *
 * Under `alchemy dev`, the web and sync Workers run in separate workerd
 * processes, each with its own connection to the same local D1 SQLite file.
 * When one writes while the other reads or writes, SQLite can refuse the
 * second with "database is locked: SQLITE_BUSY". Deployed D1 runs every query
 * through one primary, so it never does this; locally it made writes fail at
 * random ("sync error, please try again") and browser tests flaky.
 *
 * The error does not always say SQLITE_BUSY. When the lock is hit while
 * local D1 reads the transaction's bookmark, workerd logs the SQLite error
 * and hands JavaScript only "D1_ERROR: Failed to get session commit token:
 * internal error; reference = ...". That happens to reads as well as
 * writes. Local D1 rolls the transaction back when it cannot get the
 * bookmark, so this error also means nothing was written.
 *
 * Either way nothing was written, so trying again is safe. Deployed, this
 * never triggers.
 *
 * Retries run for a time budget, not a fixed number of attempts: the other
 * Worker can hold the lock for longer than a few quick retries cover.
 * Adding a feed stores all its articles in one atomic batch (10,000 take
 * about half a second, longer on a slow machine), and five attempts (about
 * half a second in all) made pages that loaded meanwhile fail with "Failed
 * query". Past the budget, the error is real and is thrown.
 */
const BUDGET_MS = 10_000
const BASE_DELAY_MS = 15
const MAX_DELAY_MS = 250
const RETRYABLE = /SQLITE_BUSY|Failed to get session commit token/

export const retryBusy = async <T>(
  run: () => Promise<T>,
  budgetMs = BUDGET_MS
): Promise<T> => {
  const giveUpAt = Date.now() + budgetMs

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      const busy =
        error instanceof Error &&
        RETRYABLE.test(`${error.message} ${String(error.cause)}`)

      if (!busy || Date.now() >= giveUpAt) throw error

      const backoff = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)

      const delay = Math.min(
        backoff * (0.5 + Math.random()),
        giveUpAt - Date.now()
      )

      await new Promise((resolve) => setTimeout(resolve, Math.max(delay, 0)))
    }
  }
}

/** The real statement behind each wrapper, for `batch`. */
const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>()

const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement => {
  const wrapped = new Proxy(statement, {
    get(target, property) {
      if (property === 'bind') {
        return (...values: readonly unknown[]) =>
          wrapStatement(target.bind(...values))
      }

      if (property === 'first') {
        return (column?: string) =>
          retryBusy(() =>
            column === undefined ? target.first() : target.first(column)
          )
      }

      if (property === 'run') return () => retryBusy(() => target.run())

      if (property === 'all') return () => retryBusy(() => target.all())

      if (property === 'raw') {
        return (options?: { readonly columnNames?: boolean }) =>
          retryBusy(() =>
            options?.columnNames === true
              ? target.raw({ columnNames: true })
              : target.raw()
          )
      }

      return undefined
    },
  })

  originals.set(wrapped, statement)

  return wrapped
}

/** A D1 binding whose statements and batches retry on SQLITE_BUSY. */
export const withBusyRetry = (d1: D1Database): D1Database =>
  new Proxy(d1, {
    get(target, property) {
      if (property === 'prepare') {
        return (query: string) => wrapStatement(target.prepare(query))
      }

      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) =>
          retryBusy(() =>
            target.batch(
              statements.map(
                (statement) => originals.get(statement) ?? statement
              )
            )
          )
      }

      if (property === 'exec') {
        return (query: string) => retryBusy(() => target.exec(query))
      }

      if (property === 'withSession') return target.withSession.bind(target)

      return undefined
    },
  })
