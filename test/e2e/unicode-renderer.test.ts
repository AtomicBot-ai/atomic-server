/** Native Unicode rendering with the embedded runtime; no real terminal or user data is required. */
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { runProcess } from '../helpers/async-binary.js'

const fixture = fileURLToPath(new URL('../fixtures/unicode-renderer.ts', import.meta.url))
const baseline = process.env['ATC_TEST_BASELINE_BUN']
const targets =
  process.platform === 'win32' && process.arch === 'x64' && baseline ? ['default', 'baseline'] : ['default']

it.each(targets)('renders Unicode in a compiled %s binary without a native exception', async (target) => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-unicode-renderer-'))
  const outfile = join(dir, process.platform === 'win32' ? 'probe.exe' : 'probe')
  try {
    const build = await runProcess('bun', [
      'build',
      '--compile',
      '--production',
      '--keep-names',
      '--sourcemap',
      ...(target === 'baseline'
        ? ['--target=bun-windows-x64-baseline', '--compile-executable-path', baseline!]
        : []),
      fixture,
      '--outfile',
      outfile,
    ])
    expect(build.code, build.err).toBe(0)
    if (process.platform === 'darwin') {
      const signed = await runProcess('codesign', ['--force', '--sign', '-', '--timestamp=none', outfile])
      expect(signed.code, signed.err).toBe(0)
    }
    const result = await runProcess(outfile, [])
    expect(result.code, result.err).toBe(0)
    expect(JSON.parse(result.out)).toMatchObject({ frames: 156, characters: expect.any(Number) })
    expect(JSON.parse(result.out).characters).toBeGreaterThan(1_000)
  } finally {
    // Windows may retain the executable mapping briefly after the child has exited.
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
