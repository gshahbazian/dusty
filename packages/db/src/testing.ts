import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Miniflare } from 'miniflare'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

/**
 * A real local D1 (workerd's SQLite, via Miniflare) with every migration
 * applied. Tests use this instead of mocks so SQL behaves as it does on
 * Cloudflare.
 */
export const createTestD1 = async (): Promise<{
  readonly d1: D1Database
  readonly dispose: () => Promise<void>
}> => {
  const mf = new Miniflare({
    modules: true,
    script:
      'export default { fetch: () => new Response(null, { status: 404 }) }',
    d1Databases: { DB: crypto.randomUUID() },
  })

  const d1 = await mf.getD1Database('DB')

  await applyMigrations(d1)

  return { d1, dispose: () => mf.dispose() }
}

const applyMigrations = async (d1: D1Database): Promise<void> => {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true })

  const dirs = entries
    .flatMap((entry) => (entry.isDirectory() ? [entry.name] : []))
    .toSorted()

  for (const dir of dirs) {
    const sql = await readFile(
      join(MIGRATIONS_DIR, dir, 'migration.sql'),
      'utf8'
    )

    const statements = sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)

    await d1.batch(statements.map((statement) => d1.prepare(statement)))
  }
}
