import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { assertBuildRuntime } from '../../scripts/build-runtime.mjs'
import { runProcess } from '../helpers/async-binary.js'

it('restarts an API listener in the compiled runtime without terminating its engine child', async () => {
  assertBuildRuntime()
  const dir = mkdtempSync(join(tmpdir(), 'atc-socket-inheritance-'))
  const outfile = join(dir, process.platform === 'win32' ? 'probe.exe' : 'probe')
  const fixture = fileURLToPath(new URL('../fixtures/socket-inheritance.mjs', import.meta.url))
  try {
    const build = await runProcess('bun', ['build', '--compile', fixture, '--outfile', outfile])
    expect(build.code, build.err).toBe(0)
    if (process.platform === 'darwin') {
      const signed = await runProcess('codesign', ['--force', '--sign', '-', '--timestamp=none', outfile])
      expect(signed.code, signed.err).toBe(0)
    }
    const result = await runProcess(outfile, [])
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('API restarted on the same port with the original child alive')
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
