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
 * A busy error means nothing was written, so trying again is safe. Deployed,
 * this never triggers.
 */
const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 15

export const retryBusy = async <T>(run: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      const busy =
        error instanceof Error &&
        /SQLITE_BUSY/.test(`${error.message} ${String(error.cause)}`)

      if (!busy || attempt >= MAX_ATTEMPTS) throw error

      const delay = BASE_DELAY_MS * 2 ** attempt * (0.5 + Math.random())

      await new Promise((resolve) => setTimeout(resolve, delay))
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
