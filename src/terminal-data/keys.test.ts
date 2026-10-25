import { mkdtempSync, rmSync } from 'node:fs'
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
    // Windows has no POSIX modes; there the folder's owner-only ACL protects it (host/acl.ts).
    if (process.platform !== 'win32') expect((await stat(a.path)).mode & 0o777).toBe(0o600)
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

it('adds a key handed to the CLI once, and refuses one that is not a key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-keys-'))
  try {
    const keys = new ClientKeys(dir)
    expect(keys.current()).toBeUndefined()
    await keys.initialize()
    await keys.ensure('my-own-key-123', 'CLI key')
    await keys.ensure('my-own-key-123', 'CLI key')
    expect(keys.current()).toHaveLength(2)
    expect(keys.current()).toContain('my-own-key-123')
    await expect(keys.ensure('short', 'CLI key')).rejects.toThrow('8 to 512')
    await expect(keys.ensure('has space in it', 'CLI key')).rejects.toThrow('without spaces')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('answers a bad name or the last key’s revocation as usage errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-keys-usage-'))
  const keys = new ClientKeys(dir)
  await expect(keys.create('x'.repeat(49))).rejects.toMatchObject({ code: 'ATC_USAGE' })
  const only = await keys.create('only')
  await expect(keys.revoke(only.id)).rejects.toMatchObject({ code: 'ATC_USAGE' })
  await expect(keys.ensure('short', 'n')).rejects.toMatchObject({ code: 'ATC_USAGE' })
  rmSync(dir, { recursive: true, force: true })
})
