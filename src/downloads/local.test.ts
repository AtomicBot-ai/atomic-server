import { mkdtemp, readFile, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { openSidecar } from './local.js'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

it('refuses to write a sidecar through a symlink', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-sidecar-'))
  dirs.push(dir)
  const outside = join(dir, 'outside')
  await writeFile(outside, 'keep')
  const link = join(dir, 'file.tmp')
  await symlink(outside, link)
  await expect(openSidecar(link, 'w+')).rejects.toThrow('Refusing to write through a symlink')
  expect(await readFile(outside, 'utf8')).toBe('keep')
})
