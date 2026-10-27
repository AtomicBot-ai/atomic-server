import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { bytesOnDisk } from './on-disk.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'atc-on-disk-'))
  dirs.push(d)
  return d
}
const URL = 'https://hub.example/model.gguf'

it('counts the bytes a ranged download recorded, not the sparse partial file', async () => {
  const d = dir(),
    file = join(d, 'model.gguf')
  writeFileSync(`${file}.url`, URL)
  writeFileSync(`${file}.tmp`, Buffer.alloc(100))
  writeFileSync(
    `${file}.ranges`,
    JSON.stringify({
      url: URL,
      size: 100,
      ranges: [
        { start: 0, end: 49, next: 30 },
        { start: 50, end: 99, next: 60 },
      ],
    })
  )
  expect(await bytesOnDisk(file, URL, 100)).toBe(40)
})

it('counts a single-stream partial by its size, a finished file by its size, nothing otherwise', async () => {
  const d = dir(),
    file = join(d, 'model.gguf')
  expect(await bytesOnDisk(file, URL, 100)).toBe(0)
  writeFileSync(`${file}.url`, URL)
  writeFileSync(`${file}.tmp`, Buffer.alloc(25))
  expect(await bytesOnDisk(file, URL, 100)).toBe(25)
  // Another URL's partial says nothing about this download.
  expect(await bytesOnDisk(file, 'https://hub.example/other.gguf', 100)).toBe(0)
  rmSync(`${file}.tmp`)
  writeFileSync(file, Buffer.alloc(100))
  expect(await bytesOnDisk(file, URL, 100)).toBe(100)
})
