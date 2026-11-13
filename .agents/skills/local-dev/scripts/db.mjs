// Run one SQL statement against a SQLite file and print the rows as a table.
// Used by db.sh; Node's built-in SQLite means no sqlite3 CLI is needed.
//   node db.mjs <database file> <sql>
import { DatabaseSync } from 'node:sqlite'

const [file, sql] = process.argv.slice(2)
if (!file || !sql) {
  console.error('usage: node db.mjs <database file> <sql>')
  process.exit(2)
}

const printRows = (statement) => {
  const rows = statement.all()
  const columns = statement.columns().map((column) => column.name)
  const cells = rows.map((row) =>
    columns.map((name) => String(row[name] ?? 'NULL'))
  )
  const widths = columns.map((name, i) =>
    Math.max(name.length, ...cells.map((line) => line[i].length))
  )
  const print = (line) =>
    console.log(
      line
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd()
    )

  print(columns)
  print(widths.map((width) => '-'.repeat(width)))
  cells.forEach(print)
  console.log(`(${rows.length} row${rows.length === 1 ? '' : 's'})`)
}

const runStatement = (statement) => {
  if (statement.columns().length > 0) return printRows(statement)

  const { changes } = statement.run()

  console.log(`${changes} row(s) changed`)
}

const db = new DatabaseSync(file)

try {
  runStatement(db.prepare(sql))
} finally {
  db.close()
}
