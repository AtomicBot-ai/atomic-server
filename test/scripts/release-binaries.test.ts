import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { TARGETS } from '../../scripts/targets.mjs'

const script = fileURLToPath(new URL('../../scripts/stage-release-binaries.mjs', import.meta.url))
const names = TARGETS.map(({ triple, platform }) => `atc-${triple}${platform === 'win32' ? '.exe' : ''}`)
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'atc-release-assets-'))
  await mkdir(join(root, 'bin'))
  for (const name of names) {
    await writeFile(join(root, 'bin', name), name)
    await writeFile(join(root, 'bin', name + '.map'), 'source map')
  }
})
afterEach(() => rm(root, { recursive: true, force: true }))
const stage = () => spawnSync(process.execPath, [script, '0.2.15'], { cwd: root, encoding: 'utf8' })
it('stages every target under its installer name without publishing compiler sidecars', async () => {
  const result = stage()
  expect(result.status, result.stderr).toBe(0)
  const expected = names.map((name) => name.replace(/^atc-/, 'atc-0.2.15-'))
  expect((await readdir(join(root, 'release'))).sort()).toEqual([...expected].sort())
  for (const [i, name] of expected.entries())
    expect(await readFile(join(root, 'release', name), 'utf8')).toBe(names[i])
})
it('requires each executable even if its source map exists', async () => {
  const missing = 'atc-aarch64-pc-windows-msvc.exe'
  await rm(join(root, 'bin', missing))
  const result = stage()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain(missing)
})
