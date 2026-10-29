/** Local Sentry stand-in and failed-release fixture; no event leaves the test machine. */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export async function reportCollector() {
  const events: string[] = []
  const server = createServer((req, res) => {
    if (req.url === '/api/42/envelope/') {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        events.push(Buffer.concat(chunks).toString('utf8'))
        res.writeHead(200).end('{}')
      })
    } else
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ tag_name: 'private-prompt-value' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    events,
    base: `http://127.0.0.1:${port}`,
    dsn: `http://test@127.0.0.1:${port}/42`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
