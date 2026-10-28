import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { AtcError } from '../errors/index.js'
import { nodeUpdateFiles } from './node-files.js'

const server = new FixtureHttpServer()
const body = Buffer.alloc(3 * 1024 * 1024)
for (let i = 0; i < body.length; i++) body[i] = (i * 7) % 253
const sha = createHash('sha256').update(body).digest('hex')
let dir = ''

beforeAll(async () => {
  await server.start()
})
afterAll(async () => {
  server.release()
  await server.stop()
})
beforeEach(async () => {
  server.reset()
  dir = await mkdtemp(join(tmpdir(), 'atc-node-files-'))
})
afterEach(async () => {
  server.release()
  await rm(dir, { recursive: true, force: true })
})

const failure = async (work: Promise<unknown>): Promise<AtcError> => {
  try {
    await work
  } catch (error) {
    if (error instanceof AtcError) return error
    throw error
  }
  throw new Error('did not fail')
}

describe('nodeUpdateFiles.download', () => {
  it('writes the body chunk by chunk and returns its SHA-256', async () => {
    server.files.set('/atc', { body })
    const path = join(dir, 'download')
    expect(await nodeUpdateFiles(fetch).download(server.url('/atc'), path)).toBe(sha)
    expect((await readFile(path)).equals(body)).toBe(true)
  })

  it('gives up a stream that sends nothing for the stall time, instead of waiting forever', async () => {
    server.files.set('/atc', { body, holdAfterBytes: 64 * 1024 })
    const files = nodeUpdateFiles(fetch, { stallMs: 300 })
    const started = Date.now()
    const error = await failure(files.download(server.url('/atc'), join(dir, 'download')))
    expect(error.code).toBe('ATC_UPDATE_FAILED')
    expect(error.message).toContain('stalled')
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('reports a connection that broke off, with the bytes that arrived', async () => {
    server.files.set('/atc', { body, dropAfterBytes: 1024, dropTimes: 1 })
    const error = await failure(nodeUpdateFiles(fetch).download(server.url('/atc'), join(dir, 'download')))
    expect(error.code).toBe('ATC_UPDATE_FAILED')
    expect(error.message).toMatch(/broke off|ended after/)
  })

  it('reports a status that is not a body', async () => {
    const error = await failure(
      nodeUpdateFiles(fetch).download(server.url('/missing'), join(dir, 'download'))
    )
    expect(error.code).toBe('ATC_UPDATE_FAILED')
    expect(error.message).toContain('404')
  })
})
