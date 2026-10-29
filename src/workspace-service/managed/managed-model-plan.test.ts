import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { nodeStoreFiles } from './managed-model-plan.js'

describe('nodeStoreFiles', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('reports no size when the path is missing', async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-store-files-'))
    expect(await nodeStoreFiles.size(join(dir, 'missing'))).toBeNull()
  })

  it('reports no size for a directory', async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-store-files-'))
    await mkdir(join(dir, 'folder'))
    expect(await nodeStoreFiles.size(join(dir, 'folder'))).toBeNull()
  })

  it('reports the byte length of a file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-store-files-'))
    const file = join(dir, 'model.bin')
    await writeFile(file, 'abcd')
    expect(await nodeStoreFiles.size(file)).toBe(4)
  })

  it('writes the text and leaves no temporary sibling', async () => {
    dir = await mkdtemp(join(tmpdir(), 'atc-store-files-'))
    const file = join(dir, 'nested', 'model.yml')
    await nodeStoreFiles.writeAtomic(file, 'name: qwen\n')
    expect(await nodeStoreFiles.readText(file)).toBe('name: qwen\n')
    await expect(stat(`${file}.tmp`)).rejects.toThrow()
  })
})
