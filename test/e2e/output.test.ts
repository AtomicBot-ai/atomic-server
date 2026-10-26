/**
 * What the built program writes into a pipe arrives whole, with its exit code: a `--json` document
 * larger than a pipe holds (64 KiB) waits for a reader that pauses, and the process does not exit until
 * the pipe has taken it all.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'

const folder = mkdtempSync(join(tmpdir(), 'atc-output-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

it('writes a --json document larger than a pipe holds in full, for a reader that pauses', async () => {
  const [exe, ...prefix] = ATC
  const child = spawn(
    exe as string,
    [...prefix, 'control', 'list', '--json', '--data-folder', join(folder, 'data')],
    {
      env: { ...process.env, NO_COLOR: '1' },
    }
  )
  // A reader that stops after the first chunk: the pipe fills and atc meets a write it cannot hand over
  // at once. Without the flush before exit the binary stopped at exactly 65536 bytes.
  const chunks: Buffer[] = []
  let paused = false
  child.stderr.on('data', () => {})
  child.stdout.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
    if (paused) return
    paused = true
    child.stdout.pause()
    setTimeout(() => child.stdout.resume(), 300)
  })
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve))
  const out = Buffer.concat(chunks).toString('utf8')
  expect(code).toBe(0)
  expect(out.length).toBeGreaterThan(64 * 1024)
  expect(() => JSON.parse(out)).not.toThrow()
})
