import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readDocument, replaceFile, writeDocument } from './store.js'

const folders: string[] = []
afterEach(async () => {
  for (const f of folders.splice(0)) await rm(f, { recursive: true, force: true })
})

const failing = (code: string, times: number) => {
  let left = times
  const calls: string[] = []
  const fn = async (from: string, to: string) => {
    calls.push(to)
    if (left-- > 0) throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code })
    await rename(from, to)
  }
  return { fn, calls }
}

// On Windows a rename over a file another handle has open (a reader listing the records) fails for a
// moment with EPERM, EACCES or EBUSY; the write retries instead of failing the work it records.
it.each(['EPERM', 'EACCES', 'EBUSY'])('retries a rename Windows refuses for a moment (%s)', async (code) => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-store-'))
  folders.push(dir)
  const path = join(dir, 'record.json')
  const r = failing(code, 2)
  await writeDocument(path, { stage: 'ready' }, { rename: r.fn })
  expect(r.calls).toHaveLength(3)
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ stage: 'ready' })
})

it('gives up on a rename that keeps failing, and leaves no temporary file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-store-'))
  folders.push(dir)
  const r = failing('EPERM', 1000)
  await expect(
    writeDocument(join(dir, 'record.json'), {}, { rename: r.fn, retryForMs: 300 })
  ).rejects.toMatchObject({
    code: 'EPERM',
  })
  const { readdir } = await import('node:fs/promises')
  expect(await readdir(dir)).toEqual([])
})

it('does not retry a rename that fails for good (ENOENT)', async () => {
  let attempts = 0
  const move = async () => {
    attempts++
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }
  await expect(replaceFile('a', 'b', move)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(attempts).toBe(1)
})

// The other side of the same race: a read that meets the rename in progress is refused for a moment.
it('reads a document again when Windows refuses the read for a moment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-store-'))
  folders.push(dir)
  const path = join(dir, 'record.json')
  await writeDocument(path, { stage: 'ready' })
  let refusals = 2
  const read = async (p: string) => {
    if (refusals-- > 0) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
    return readFile(p, 'utf8')
  }
  expect(await readDocument(path, null, { readFile: read })).toEqual({ stage: 'ready' })
  expect(refusals).toBe(-1)
})

// On Windows a reader that has the file open leaves its name "delete pending": every rename over it
// fails until the reader closes. Busy readers make that last longer than a second or two.
it('keeps trying a refused rename for several seconds, not a fixed number of times', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-store-'))
  folders.push(dir)
  const path = join(dir, 'record.json')
  const r = failing('EPERM', 25) // ~2 s of refusals with the backoff below 100 ms
  await writeDocument(path, { stage: 'ready' }, { rename: r.fn })
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ stage: 'ready' })
}, 15_000)
