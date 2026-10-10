import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { BINARY, ROOT } from '../helpers/binary.js'
const root = ROOT
const binary = BINARY
it('streams chat through the built executable against an isolated local endpoint', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'atc-chat-e2e-'))
  let received = ''
  const server = createServer((req, res) => {
    req.on('data', (chunk) => {
      received += String(chunk)
    })
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n')
      res.end('data: {"choices":[{"delta":{"content":"terminal"}}]}\n\ndata: [DONE]\n\n')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    const args = [
      'chat',
      '--endpoint',
      `http://127.0.0.1:${address.port}/v1`,
      '--model',
      'fixture-model',
      'Hello',
      '--json',
      '--data-folder',
      join(folder, 'data'),
    ]
    const result = await promisify(execFile)(
      existsSync(binary) ? binary : process.execPath,
      existsSync(binary) ? args : [join(root, 'dist/bin.js'), ...args],
      { timeout: 20000, env: { ...process.env, NO_COLOR: '1' } }
    )
    expect(JSON.parse(result.stdout)).toEqual({ model: 'fixture-model', reply: 'Hello terminal' })
    expect(JSON.parse(received)).toMatchObject({
      model: 'fixture-model',
      stream: true,
      messages: [{ role: 'user', content: 'Hello' }],
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(folder, { recursive: true, force: true })
  }
})
