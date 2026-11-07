import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const BUN_VERSION = readFileSync(new URL('../.bun-version', import.meta.url), 'utf8').trim()

/** The packaged runtime owns sockets: an older compiler can reintroduce Windows handle inheritance. */
export function assertBuildRuntime(run = spawnSync) {
  const result = run('bun', ['--version'], { encoding: 'utf8' })
  const actual = result.status === 0 ? result.stdout?.trim() : undefined
  if (actual !== BUN_VERSION)
    throw new Error(
      `Building atc requires Bun ${BUN_VERSION}; found ${actual || 'no working bun on PATH'}. ` +
        'Install the version in .bun-version and put it first on PATH.'
    )
}
