import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { engineOutputSink } from './engine-log.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

it('writes every engine line under its provider and model, with the stream it came from', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-engine-log-'))
  dirs.push(dir)
  const path = join(dir, 'engines.log')
  const sink = engineOutputSink(path, { maxSizeBytes: 1024 * 1024, maxFiles: 2 })
  sink({
    provider: 'llamacpp-upstream',
    model: 'qwen3-8b',
    stream: 'stderr',
    line: 'load_tensors: offloaded 29/29',
  })
  sink({ provider: 'mlx', model: 'm', stream: 'stdout', line: 'ready' })
  const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
  expect(lines[0]).toMatch(
    /^\S+ \[info\] llamacpp-upstream\/qwen3-8b: \[stderr\] load_tensors: offloaded 29\/29$/
  )
  expect(lines[1]).toMatch(/ mlx\/m: \[stdout\] ready$/)
})
