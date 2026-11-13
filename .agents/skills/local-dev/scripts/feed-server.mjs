// Serve the sync test fixtures over HTTP for local dev, so syncs need no
// internet. Supports ETag / If-None-Match, so a second sync gets a 304.
//   node feed-server.mjs [port]      (default 5175)
//
// Routes:
//   /<fixture file>   e.g. /rss.xml, /atom.xml, /feed.json, /hostile.xml
//   /status/<code>    answers with that HTTP status
//   /slow             never answers (exercises the fetch timeout)
//   /html             an HTML page, not a feed
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

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname

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
