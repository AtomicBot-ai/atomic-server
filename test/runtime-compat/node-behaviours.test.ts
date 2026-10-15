/**
 * The few Node behaviours the daemon and the admin depend on, pinned so a runtime change (Node
 * major, Bun release) shows up here first. Runs under vitest and under `bun test`.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

describe('runtime behaviours', () => {
  it('a detached, unref-ed child does not keep the parent alive and survives it', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 200)'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    expect(child.pid).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 50))
    expect(() => process.kill(child.pid as number, 0)).not.toThrow()
    child.kill()
  })

  it('gzip round-trips base64 payloads (the embedded admin assets)', () => {
    const text = 'x'.repeat(10_000)
    const gz = gzipSync(Buffer.from(text)).toString('base64')
    expect(gunzipSync(Buffer.from(gz, 'base64')).toString()).toBe(text)
  })

  it('streams server-sent events chunk by chunk', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(': connected\n\n')
      setTimeout(() => res.write('event: x\ndata: 1\n\n'), 20)
      setTimeout(() => res.end(), 60)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as { port: number }).port
    const chunks: string[] = []
    await new Promise<void>((resolve) => {
      get(`http://127.0.0.1:${port}/`, (res) => {
        res.on('data', (c: Buffer) => chunks.push(c.toString()))
        res.on('end', () => resolve())
      })
    })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.join('')).toContain('event: x')
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('writes byte ranges at their offsets in one file and appends at 0 after a truncate (the downloader)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atc-compat-'))
    const path = join(dir, 'model.gguf.tmp')
    try {
      const ranged = await open(path, 'w+')
      await Promise.all([
        ranged.write(Buffer.from('cd'), 0, 2, 2),
        ranged.write(Buffer.from('ab'), 0, 2, 0),
        ranged.write(Buffer.from('efXX'), 0, 2, 4),
      ])
      await ranged.datasync()
      await ranged.close()
      expect(await readFile(path, 'utf8')).toBe('abcdef')
      await writeFile(path, 'stale')
      const single = await open(path, 'a')
      await single.truncate(0)
      await single.write(Buffer.from('fresh'))
      await single.close()
      expect(await readFile(path, 'utf8')).toBe('fresh')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
