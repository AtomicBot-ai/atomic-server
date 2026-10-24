import { mkdtemp, mkdir, readFile, stat, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { discardDownloadFiles } from './discard.js'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function folder() {
  const path = await mkdtemp(join(tmpdir(), 'atc-discard-'))
  roots.push(path)
  return path
}
it('removes the exact completed file and partial sidecars, keeping shared and unrelated files', async () => {
  const root = await folder()
  for (const file of ['a', 'a.tmp', 'a.url', 'a.ranges', 'shared', 'shared.tmp', 'other'])
    await writeFile(join(root, file), file)
  await discardDownloadFiles(root, ['a', 'shared'], ['shared'])
  for (const file of ['a', 'a.tmp', 'a.url', 'a.ranges'])
    await expect(stat(join(root, file))).rejects.toThrow()
  for (const file of ['shared', 'shared.tmp', 'other'])
    expect(await readFile(join(root, file), 'utf8')).toBe(file)
})
it('rejects traversal and symlink escapes before deleting any files', async () => {
  const root = await folder(),
    outside = await folder()
  await writeFile(join(root, 'keep'), 'safe')
  await mkdir(join(outside, 'dir'))
  await symlink(join(outside, 'dir'), join(root, 'link'))
  await expect(discardDownloadFiles(root, ['keep', 'link/file'])).rejects.toThrow('outside')
  await expect(discardDownloadFiles(root, ['keep', '../escape'])).rejects.toThrow('outside')
  expect(await readFile(join(root, 'keep'), 'utf8')).toBe('safe')
})

it('preserves files referenced through an in-folder symlink alias', async () => {
  const root = await folder()
  await mkdir(join(root, 'actual'))
  await symlink(join(root, 'actual'), join(root, 'alias'))
  await writeFile(join(root, 'actual/weights'), 'shared')
  await writeFile(join(root, 'actual/weights.tmp'), 'partial')
  await discardDownloadFiles(root, ['actual/weights'], ['alias/weights'])
  expect(await readFile(join(root, 'actual/weights'), 'utf8')).toBe('shared')
  expect(await readFile(join(root, 'actual/weights.tmp'), 'utf8')).toBe('partial')
})
