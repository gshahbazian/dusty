// Keep only a feed's first N articles (default 10), editing the original
// text so everything else stays as the publisher wrote it.
//   node trim-feed.mjs <file> [count]
import { readFile, writeFile } from 'node:fs/promises'

const [file, count = '10'] = process.argv.slice(2)
const keep = Number(count)
const body = await readFile(file, 'utf8')

const trimmed = file.endsWith('.json')
  ? (() => {
      const feed = JSON.parse(body)

      return `${JSON.stringify({ ...feed, items: feed.items.slice(0, keep) }, null, 2)}\n`
    })()
  : (() => {
      // RSS <item>…</item> or Atom <entry>…</entry>: drop every one after
      // the first `keep`.
      let seen = 0

      return body.replace(
        /\s*<(item|entry)(\s[^>]*)?>[\s\S]*?<\/\1>/g,
        (block) => (++seen <= keep ? block : '')
      )
    })()

await writeFile(file, trimmed)
