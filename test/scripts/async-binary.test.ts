import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, it, vi } from 'vitest'
import { runProcess } from '../helpers/async-binary.js'

it('keeps the parent responsive while a child awaits its HTTP reply and forwards stdin, UTF-8 and exit status', async () => {
  const server = createServer((_req, res) => res.end('parent answered'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        `
      (async () => {
        let input = ''
        for await (const chunk of process.stdin) input += chunk
        const response = await fetch('http://127.0.0.1:${port}')
        process.stdout.write(input + ':' + await response.text())
        process.stderr.write(process.env.ATC_TEST_VALUE)
        process.exitCode = 7
      })()
    `,
      ],
      { input: 'coffee ☕', env: { ATC_TEST_VALUE: 'stderr value' } }
    )
    expect(result).toEqual({ code: 7, out: 'coffee ☕:parent answered', err: 'stderr value' })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it('reports a missing executable instead of rejecting or emitting an unhandled error', async () => {
  expect(await runProcess('atc-e2e-executable-does-not-exist', [])).toMatchObject({
    code: null,
    out: '',
    err: expect.stringContaining('ENOENT'),
  })
})

it('terminates a hung child at the command timeout', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 })
  expect(result.code).toBeNull()
  expect(result.err).toContain('Command failed')
})

it('preserves explicit environment removals, including PowerShell module search paths', async () => {
  vi.stubEnv('ATC_TEST_PARENT_ONLY', 'must not inherit')
  try {
    const env = { ...process.env }
    delete env['ATC_TEST_PARENT_ONLY']
    const result = await runProcess(
      process.execPath,
      ['-e', 'process.stdout.write(String(process.env.ATC_TEST_PARENT_ONLY))'],
      { env }
    )
    expect(result).toMatchObject({ code: 0, out: 'undefined' })
  } finally {
    vi.unstubAllEnvs()
  }
})
