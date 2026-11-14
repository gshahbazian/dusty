// Serve the sync test fixtures over HTTP for local dev, so syncs need no
// internet. Supports ETag / If-None-Match, so a second sync gets a 304.
//   node feed-server.mjs [port]      (default 5175)
//
// Routes:
//   /<fixture file>   e.g. /rss.xml, /atom.xml, /feed.json, /hostile.xml
//   /status/<code>    answers with that HTTP status
//   /slow             never answers (exercises the fetch timeout)
//   /html             an HTML page, not a feed
//   /generated.xml?run=<id>   an RSS feed of N items (3 to start)
//   /generated/add?run=<id>   adds one item to that feed, newer than the rest
//                             (lets a test land new articles mid-test)
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'

const root = join(import.meta.dirname, '../../../../apps/sync/test/fixtures')
const port = Number(process.argv[2] ?? 5175)

const types = {
  // No charset: the XML declaration says which (see latin1.xml).
  '.xml': 'application/xml',
  '.json': 'application/feed+json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
}

const contentType = (name) => {
  const extension = name.slice(name.lastIndexOf('.'))

  return types[extension] ?? 'application/octet-stream'
}

const serveFixture = async (name, request, response) => {
  const files = await readdir(root)

  if (!files.includes(name)) {
    response.writeHead(404).end('no such fixture')

    return
  }

  const body = await readFile(join(root, name))
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`

  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { etag }).end()

    return
  }

  response.writeHead(200, { 'content-type': contentType(name), etag }).end(body)
}

/** Item counts for /generated.xml, by `run`. */
const generated = new Map()
const GENERATED_START = Date.UTC(2026, 0, 1)

const generatedFeed = (run) => {
  const count = generated.get(run) ?? 3
  const items = Array.from({ length: count }, (_, i) => {
    const n = i + 1
    const date = new Date(GENERATED_START + n * 3_600_000).toUTCString()

    return `<item><title>Generated ${n}</title><guid>generated-${run}-${n}</guid><link>https://generated.example.com/${run}/${n}</link><pubDate>${date}</pubDate><description><![CDATA[<p>Item ${n} of ${run}</p><p><a href="https://generated.example.com/${run}/${n}/more">More</a></p><img src="https://generated.example.com/${run}/${n}.png" alt="Picture ${n}">]]></description></item>`
  })

  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Generated ${run}</title><link>https://generated.example.com/</link>${items.join('')}</channel></rss>`
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost')
  const path = requestUrl.pathname
  const run = requestUrl.searchParams.get('run') ?? 'default'

  if (path === '/generated.xml') {
    response
      .writeHead(200, { 'content-type': 'application/rss+xml' })
      .end(generatedFeed(run))

    return
  }

  if (path === '/generated/add') {
    generated.set(run, (generated.get(run) ?? 3) + 1)
    response.writeHead(200).end(String(generated.get(run)))

    return
  }

  console.log(`${request.method} ${path}`)

  if (path === '/slow') return

  if (path === '/html') {
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<html><body>not a feed</body></html>')

    return
  }

  const status = /^\/status\/(\d{3})$/.exec(path)

  if (status !== null) {
    response.writeHead(Number(status[1])).end()

    return
  }

  await serveFixture(path.slice(1), request, response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`feed server on http://localhost:${port}`)
})
