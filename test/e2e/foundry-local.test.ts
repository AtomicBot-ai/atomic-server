/**
 * Foundry Local through the built `atc` (task 6.5): the engine installed from a manifest on disk
 * (`ATOMIC_FOUNDRY_LOCAL_MANIFEST_URL`) with its archive behind atc's proxy, the core's host stand-in
 * (`ATOMIC_FOUNDRY_HOST_TEST_COMMAND`) instead of the library, conf's list and Azure on loopback. A
 * variant is downloaded with one expired link (403) in the middle, loaded, answers through the public
 * API, and is removed.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { confList, serveAzure, WEIGHTS } from '../helpers/foundry-azure.js'
import { foundryLocalTestPlatform } from '../helpers/foundry-local-platform.js'
import { startReleaseMirror } from '../helpers/release-mirror.js'
import type { ReleaseMirror } from '../helpers/release-mirror.js'
import { waitFor } from '../helpers/wait-for.js'

const PLATFORM = process.platform === 'win32' ? null : foundryLocalTestPlatform()
const ALL_PLATFORMS = ['win-x64', 'win-arm64', 'macos-arm64', 'linux-x64', 'linux-arm64']
const VARIANT = 'gemma-4-e2b-it-generic-cpu'
const WEIGHTS_PATH = '/container/v3/model.onnx?sig=1'
const KEY = `atc_${'7'.repeat(64)}`
const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-fl-'))
const dataFolder = join(scratch, 'data')
const azure = new FixtureHttpServer()
let mirror: ReleaseMirror
let base = ''
let env: NodeJS.ProcessEnv

/** Never `spawnSync`: the mirror and Azure are servers in this process. */
function atc(...rest: string[]): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(ATC[0] as string, [...ATC.slice(1), ...rest, '--data-folder', dataFolder], { env })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
  return new Promise((resolve) => child.on('exit', (code) => resolve({ code, out, err })))
}

/** The build's archive (a `lib/` the stand-in host never reads) and the manifest that pins it. */
function publishBuild() {
  const src = join(scratch, 'fl-src')
  mkdirSync(join(src, 'lib'), { recursive: true })
  writeFileSync(join(src, 'lib', 'libfoundry_local.so'), 'so')
  writeFileSync(join(src, 'lib', 'libfoundry_local.dylib'), 'dylib')
  const archive = join(scratch, 'fl.tgz')
  spawnSync('tar', ['-czf', archive, '-C', src, 'lib'])
  const body = readFileSync(archive)
  const tag = 'v2.1.0'
  for (const platform of ALL_PLATFORMS)
    mirror.serve(`/microsoft/foundry-local/releases/download/${tag}/foundry-local-${platform}.tgz`, body)
  const manifest = join(scratch, 'foundry-local-manifest.json')
  writeFileSync(
    manifest,
    JSON.stringify({
      schema_version: 1,
      upstream_repo: 'microsoft/foundry-local',
      releases: [
        {
          tag,
          published_at: '2026-09-30T00:43:42Z',
          min_core_version: '0.1.0',
          c_api_version: 2,
          assets: ALL_PLATFORMS.map((platform) => ({
            platform,
            name: `foundry-local-${platform}.tgz`,
            size: body.length,
            sha256: createHash('sha256').update(body).digest('hex'),
          })),
        },
      ],
    })
  )
  return pathToFileURL(manifest).href
}

beforeAll(async () => {
  if (PLATFORM === null) return
  mirror = await startReleaseMirror()
  base = await azure.start()
  serveAzure(azure, base, 'generic-cpu', '1')
  const host = join(scratch, 'fake-foundry-host')
  const script = fileURLToPath(new URL('../helpers/fake-foundry-host.mjs', import.meta.url))
  writeFileSync(host, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`)
  chmodSync(host, 0o755)
  env = {
    ...process.env,
    NO_COLOR: '1',
    ATOMIC_FOUNDRY_LOCAL_MANIFEST_URL: publishBuild(),
    ATOMIC_FOUNDRY_HOST_TEST_COMMAND: host,
    ATC_FOUNDRY_LOCAL_MODELS_URL: confList(join(scratch, 'foundry-local-models.json'), base),
    ATC_PROXY_URL: mirror.proxy.url,
    ATC_PROXY_IGNORE_SSL: 'true',
    ATC_PROXY_NO_PROXY: '127.0.0.1',
  }
  if ((await atc('start', '--admin-port', '0')).code !== 0) throw new Error('atc start failed')
})

afterAll(async () => {
  if (PLATFORM === null) return
  await atc('stop', '--force', '--kill')
  azure.release()
  await azure.stop()
  await mirror.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe.skipIf(PLATFORM === null)(`Foundry Local (${ATC.join(' ')})`, () => {
  it('installs the engine through the proxy and prepares the accelerator the host offers', async () => {
    const res = await atc('engines', 'install', 'foundry-local', '--yes')
    expect(res.code, res.err).toBe(0)
    expect(mirror.seen).toContain(
      `/microsoft/foundry-local/releases/download/v2.1.0/foundry-local-${PLATFORM}.tgz`
    )
    expect(existsSync(join(dataFolder, 'foundry-local', 'backends', 'v2.1.0', PLATFORM as string))).toBe(true)
    expect(`${res.out}${res.err}`).toMatch(/WebGpu\S* .*prepared|prepared.*WebGpu/i)
  })

  it('downloads a variant across an expired link, continuing the partial file', async () => {
    azure.files.get(WEIGHTS_PATH)!.holdAfterBytes = 200_000
    const pulling = atc('models', 'pull', 'gemma-4-e2b-it', '--engine', 'foundry-local', '--device', 'cpu')
    await waitFor(() => (azure.sent.get(WEIGHTS_PATH) ?? 0) >= 200_000, 20_000)
    // The fixture's write can precede the child's receive/write under parallel test load.
    // Expire only after there is a persisted partial to resume, not merely bytes in the socket buffer.
    const partial = join(dataFolder, 'foundry-local', 'models', VARIANT, 'model.onnx.tmp')
    await waitFor(() => existsSync(partial) && statSync(partial).size >= 200_000, 20_000)
    const offset = statSync(partial).size
    // The link expires: it answers 403 from now on, and the resolver names a fresh one.
    azure.files.set(WEIGHTS_PATH, { body: WEIGHTS, failStatus: 403, failTimes: 99 })
    serveAzure(azure, base, 'generic-cpu', '2')
    azure.cut()
    const res = await pulling
    expect(res.code, res.err).toBe(0)
    expect(res.out).toContain(`atc run ${VARIANT} --engine foundry-local`)
    expect(
      azure.requests.find((r) => r.method === 'GET' && r.path === '/container/v3/model.onnx?sig=2')?.range
    ).toBe(`bytes=${offset}-`)
    const list = await atc('models', 'list')
    expect(list.out).toMatch(new RegExp(`${VARIANT}\\s+foundry-local \\(CPU\\)`))
  })

  it('loads the variant, and the public API answers from it', async () => {
    const run = await atc('run', VARIANT)
    expect(run.code, run.err).toBe(0)
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const free = (probe.address() as { port: number }).port
        probe.close(() => resolve(free))
      })
    })
    const api = await atc('api', 'start', '--port', String(port), '--api-key', KEY)
    expect(api.code, api.err).toBe(0)
    const chat = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model: VARIANT, messages: [{ role: 'user', content: 'hi' }] }),
    })
    expect(chat.status, await chat.clone().text()).toBe(200)
    expect(
      ((await chat.json()) as { choices: { message: { content: string } }[] }).choices[0]?.message.content
    ).toBe('hi from fake foundry')
  })

  it('removes the loaded variant: unloaded, its folder gone, no longer listed', async () => {
    const res = await atc('models', 'rm', VARIANT, '--yes')
    expect(res.code, res.err).toBe(0)
    expect(res.out).toContain('(unloaded first)')
    expect(existsSync(join(dataFolder, 'foundry-local', 'models', VARIANT))).toBe(false)
    expect((await atc('models', 'list')).out).not.toContain(VARIANT)
  })
})
