/**
 * The built program on the 0.2.1 server bugs (ADR 2026-10-27): a port another program holds on a
 * wildcard address is busy to `doctor` and to `api start`; the server brings the API up by itself
 * (`api.autoStart`) and says in its log what `models.autoLoad` could not load; `models catalog
 * --engine` narrows the catalog instead of crashing. No engine or model is downloaded here.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { runAtcAsync } from '../helpers/async-binary.js'

const dataFolder = join(mkdtempSync(join(tmpdir(), 'atc-e2e-fixes-')), 'data')

const atc = (...args: string[]) =>
  runAtcAsync([...args, '--data-folder', dataFolder], {
    env: { ATC_API_AUTO_START: undefined },
    timeoutMs: 90_000,
  })
const json = <T>(text: string): T => JSON.parse(text) as T

let held: Server | undefined
afterEach(() => {
  held?.close()
  held = undefined
})
afterAll(async () => {
  await atc('stop', '--force', '--kill')
  rmSync(join(dataFolder, '..'), { recursive: true, force: true })
})

/** Another program (the desktop app) listening on every address, as on macOS beside atc. */
const hold = () =>
  new Promise<number>((resolve) => {
    held = createServer()
    held.listen(0, '0.0.0.0', () => resolve((held!.address() as { port: number }).port))
  })

describe('a port another program holds', async () => {
  it('is busy to doctor and refused by api start, on the wildcard address too', async () => {
    const port = await hold()
    expect((await atc('config', 'set', 'api.port', String(port))).code).toBe(0)
    expect((await atc('config', 'set', 'admin.port', '0')).code).toBe(0)
    const doctor = await atc('doctor')
    expect(doctor.out).toMatch(new RegExp(`${port} in use by another program`))
    const start = await atc('api', 'start')
    expect(start.code).toBe(1)
    expect(start.err).toContain('ATC_PORT_BUSY')
    expect(start.err).toContain(`Port ${port}`)
    expect((await atc('stop')).code).toBe(0)
  })
})

describe('the server once it is ready', async () => {
  it('starts the API by default, keeps it down on api.autoStart=false, and logs an autoLoad it cannot do', async () => {
    expect((await atc('config', 'set', 'api.port', '0')).code).toBe(0)
    expect((await atc('config', 'set', 'models.autoLoad', 'no-such-model')).code).toBe(0)
    const started = await atc('start', '--json')
    expect(started.code).toBe(0)
    expect(json<{ api: { running: boolean } }>(started.out).api.running).toBe(true)
    // The API comes up before the ready record; the model loads after it, so the log line may follow.
    const deadline = Date.now() + 15_000
    let log = (await atc('logs')).out
    while (!log.includes('models.autoLoad') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      log = (await atc('logs')).out
    }
    expect(log).toContain('API started (api.autoStart)')
    expect(log).toContain('no-such-model not loaded (models.autoLoad)')
    expect((await atc('config', 'set', 'api.autoStart', 'false')).code).toBe(0)
    const restarted = await atc('restart', '--json')
    expect(json<{ api: { running: boolean } }>(restarted.out).api.running).toBe(false)
    expect((await atc('stop')).code).toBe(0)
  })
})

describe('models catalog --engine', async () => {
  it('narrows the catalog to what the engine runs and refuses an unknown engine', async () => {
    mkdirSync(join(dataFolder, 'atc', 'cache'), { recursive: true })
    writeFileSync(
      join(dataFolder, 'atc', 'cache', 'workspace-staff-picks.json'),
      JSON.stringify({
        at: Date.now(),
        data: {
          picks: [
            { model_name: 'fixture/one-GGUF', title: 'One', format: 'gguf' },
            { model_name: 'fixture/two-MLX', title: 'Two', format: 'mlx' },
          ],
        },
      })
    )
    const mlx = await atc('models', 'catalog', '--engine', 'mlx', '--json')
    expect(mlx.code).toBe(process.platform === 'darwin' && process.arch === 'arm64' ? 0 : 2)
    if (mlx.code === 0)
      expect(json<{ result: { rows: { id: string }[] } }>(mlx.out).result.rows.map((r) => r.id)).toEqual([
        'fixture/two-MLX',
      ])
    const gguf = await atc('models', 'catalog', '--engine', 'llamacpp-upstream', '--json')
    expect(gguf.code).toBe(0)
    expect(json<{ result: { rows: { id: string }[] } }>(gguf.out).result.rows.map((r) => r.id)).toEqual([
      'fixture/one-GGUF',
    ])
    const bogus = await atc('models', 'catalog', '--engine', 'bogus')
    expect(bogus.code).toBe(2)
    expect(bogus.err).not.toContain('ATC_INTERNAL')
    expect((await atc('stop')).code).toBe(0)
  })
})
