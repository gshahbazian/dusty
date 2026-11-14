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
 * Either way nothing was written, so trying again is safe. Still, it is
 * only turned on under `alchemy dev` (`createDb`'s `retryBusy`): deployed
 * D1 never needs it, and a retry there could hide a write that did land.
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

/**
 * The binding's types list every member, so these wrappers have to supply
 * each one: none can quietly go missing.
 */
const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement => {
  function raw<T = unknown[]>(options: {
    columnNames: true
  }): Promise<[string[], ...T[]]>
  function raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>
  function raw(options?: { readonly columnNames?: boolean }) {
    return retryBusy(() =>
      options?.columnNames === true
        ? statement.raw({ columnNames: true })
        : statement.raw()
    )
  }

  const wrapped: D1PreparedStatement = {
    bind: (...values) => wrapStatement(statement.bind(...values)),
    first: <T>(column?: string) =>
      retryBusy(() =>
        column === undefined ? statement.first<T>() : statement.first<T>(column)
      ),
    run: <T>() => retryBusy(() => statement.run<T>()),
    all: <T>() => retryBusy(() => statement.all<T>()),
    raw,
  }

  originals.set(wrapped, statement)

  return wrapped
}

/** A D1 binding whose statements and batches retry on SQLITE_BUSY. */
export const withBusyRetry = (d1: D1Database): D1Database => ({
  prepare: (query) => wrapStatement(d1.prepare(query)),
  batch: (statements) =>
    retryBusy(() =>
      d1.batch(
        statements.map((statement) => originals.get(statement) ?? statement)
      )
    ),
  exec: (query) => retryBusy(() => d1.exec(query)),
  // Sessions and dumps aren't used here; they go to the binding as is.
  withSession: (constraintOrBookmark) => d1.withSession(constraintOrBookmark),
  dump: () => d1.dump(),
})
