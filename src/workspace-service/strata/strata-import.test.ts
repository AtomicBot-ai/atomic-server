import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { StrataFile } from '@atomic-chat/core/contracts'
import { importStrataSources, stagedStrataImportBytes } from './sources.js'

const file: StrataFile = {
  path: 'model.gguf',
  source_path: 'model.gguf',
  source: 'fixture',
  role: 'weights',
  size: 4,
  sha256: createHash('sha256').update('good').digest('hex'),
}

it('refuses a corrupt shard and installs only a verified copy, leaving the import intact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atc-strata-import-'))
  try {
    const from = join(root, file.path)
    const target = join(root, 'staging')
    const signal = new AbortController().signal
    await writeFile(from, 'badd')
    await expect(importStrataSources(root, target, [file], signal)).rejects.toThrow(/hash verification/i)
    await expect(readFile(join(target, file.path))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(from, 'utf8')).toBe('badd')
    await writeFile(from, 'good')
    await importStrataSources(root, target, [file], signal)
    expect(await stagedStrataImportBytes(target, [file], signal)).toBe(file.size)
    await writeFile(join(target, file.path), 'badd')
    expect(await stagedStrataImportBytes(target, [file], signal)).toBe(0)
    expect(await readFile(from, 'utf8')).toBe('good')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
