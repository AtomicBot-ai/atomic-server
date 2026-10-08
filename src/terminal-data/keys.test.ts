import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { ClientKeys } from './keys.js'
it('keeps named keys private, supports concurrent creation, and revokes without a restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-keys-'))
  try {
    const a = new ClientKeys(folder),
      b = new ClientKeys(folder)
    await a.initialize('existing-preview-key')
    await b.initialize('must-not-replace')
    const [one, two] = await Promise.all([a.create('Atomic Agent'), b.create('Laptop')])
    expect(a.current()).toEqual(expect.arrayContaining(['existing-preview-key', one.token, two.token]))
    const views = await a.list()
    expect(JSON.stringify(views)).not.toContain(one.token)
    expect((await stat(a.path)).mode & 0o777).toBe(0o600)
    await b.revoke(one.id)
    expect(a.current()).not.toContain(one.token)
    expect(await a.get(two.id)).toBe(two.token)
    await a.revoke(two.id)
    await expect(a.revoke(views[0]!.id)).rejects.toThrow('replacement')
    await writeFile(a.path, '{broken')
    expect(a.current()).toEqual([])
    await expect(a.create('Do not overwrite')).rejects.toThrow('preserved')
    expect(await readFile(a.path, 'utf8')).toBe('{broken')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
