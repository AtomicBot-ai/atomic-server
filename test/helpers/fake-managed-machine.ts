// Lifted from atomic-chat-core/test/helpers/fake-managed-host.ts @ 98a39a76 (v0.18.5); adapted: the vLLM descriptor instead of TensorRT-LLM's, only what the atc e2e uses (no conf outages, no free-disk changes, no failing pulls), fixtures from `test/fixtures/managed/`.
/**
 * A fake Linux machine for the managed-engine e2e of the built `atc`: the folder
 * `ATOMIC_MANAGED_TEST_HOST` names (the core's `linux-host.ts`), with one `bin/<command>` wrapper per
 * probe command around `fake-linux-host.mjs`, `root/etc/os-release`, `free-disk-bytes`, a fake Docker
 * Engine API on `docker.sock` that streams byte progress for an image pull, and conf's environment
 * manifest on a loopback HTTPS server with the test CA. Nothing here runs a real Docker.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FAKE_HOST = fileURLToPath(new URL('./fake-linux-host.mjs', import.meta.url))
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/managed/${name}`, import.meta.url))
export const VLLM_DESCRIPTOR_URL = new URL('../fixtures/managed/runtimes/vllm.json', import.meta.url).href
const DESCRIPTOR = JSON.parse(readFileSync(fixture('runtimes/vllm.json'), 'utf8')) as {
  descriptor_id: string
  image: Record<string, { repository: string; digest: string }>
  required_disk_bytes: number
}
export const VLLM_DESCRIPTOR_ID = DESCRIPTOR.descriptor_id
const GIB = 1024 ** 3
const COMMANDS = [
  'uname',
  'nvidia-smi',
  'docker',
  'nvidia-ctk',
  'dpkg-query',
  'rpm',
  'pacman',
  'snap',
  'id',
  'getent',
  'systemctl',
]

/** A ready Ubuntu 24.04 desktop with an RTX 4090, Docker and the NVIDIA runtime, the user in `docker`. */
export const readyMachine = () => ({
  driver: '590.44.01',
  gpus: [
    {
      uuid: 'GPU-0b6f4f4e-6c1c-3a54-8f2d-1b0d2f4d6a11',
      name: 'NVIDIA GeForce RTX 4090',
      cc: '8.9',
      total_mib: 24564,
      free_mib: 24000,
    },
  ],
  docker: { installed: true, reachable: true, service_active: true, gpu_runtime: true },
  toolkit: true,
  group: { configured: true, effective: true },
  gpu_visible_in_container: true,
  images: [] as string[],
  containers: [] as unknown[],
})

export interface FakeManagedMachine {
  dir: string
  env: Record<string, string>
  /** Every image pull the Engine API received, as `repository@digest`. */
  pulls: string[]
  /** While true, the engine image pull sends one progress line and then waits for `releasePull`. */
  holdPull: boolean
  releasePull(): void
  close(): Promise<void>
}

export async function fakeManagedMachine(initial = readyMachine()): Promise<FakeManagedMachine> {
  // Short: the Engine API is a unix socket inside it, and macOS caps those paths at 104 bytes.
  const dir = await mkdtemp(join(tmpdir(), 'amm-'))
  const statePath = join(dir, 'state.json')
  mkdirSync(join(dir, 'bin'))
  mkdirSync(join(dir, 'root', 'etc', 'docker'), { recursive: true })
  mkdirSync(join(dir, 'root', 'run', 'systemd', 'system'), { recursive: true })
  writeFileSync(join(dir, 'root', 'etc', 'os-release'), readFileSync(fixture('os-release-ubuntu-24.04.txt')))
  writeFileSync(join(dir, 'free-disk-bytes'), String(DESCRIPTOR.required_disk_bytes + 50 * GIB))
  for (const command of COMMANDS) {
    const wrapper = join(dir, 'bin', command)
    writeFileSync(
      wrapper,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_HOST)} ${JSON.stringify(statePath)} ${command} "$@"\n`
    )
    chmodSync(wrapper, 0o755)
  }
  const read = () => JSON.parse(readFileSync(statePath, 'utf8')) as ReturnType<typeof readyMachine>
  const write = (state: ReturnType<typeof readyMachine>) => {
    writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2))
    renameSync(`${statePath}.tmp`, statePath)
    if (state.docker.gpu_runtime)
      writeFileSync(
        join(dir, 'root', 'etc', 'docker', 'daemon.json'),
        JSON.stringify({ runtimes: { nvidia: { path: 'nvidia-container-runtime' } } })
      )
  }
  write(initial)

  const tls = (name: string) => readFileSync(fixture(`tls/${name}`))
  const conf = https.createServer({ key: tls('server.key'), cert: tls('server.pem') }, (req, res) => {
    if (new URL(req.url ?? '/', 'https://conf').pathname !== '/runtimes/environments/linux.json') {
      res.writeHead(404).end('404: Not Found')
      return
    }
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(readFileSync(fixture('environments/linux.json')))
  })
  await new Promise<void>((resolve) => conf.listen(0, '127.0.0.1', resolve))
  const confPort = (conf.address() as { port: number }).port

  let release: (() => void) | undefined
  const machine: FakeManagedMachine = {
    dir,
    env: {
      ATOMIC_MANAGED_TEST_HOST: dir,
      ATOMIC_RUNTIME_DESCRIPTOR_URL_VLLM: VLLM_DESCRIPTOR_URL,
      ATOMIC_ENVIRONMENT_MANIFEST_URL: `https://127.0.0.1:${confPort}/runtimes/environments/linux.json`,
      NODE_EXTRA_CA_CERTS: fixture('tls/ca.pem'),
    },
    pulls: [],
    holdPull: false,
    releasePull: () => release?.(),
    close: async () => {
      release?.()
      for (const listening of [engineApi, conf]) {
        listening.closeAllConnections()
        await new Promise<void>((resolve) => listening.close(() => resolve()))
      }
    },
  }

  // The Docker Engine API's pull: one JSON progress line per tick, then the image exists.
  const engineApi = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://engine')
    if (req.method !== 'POST' || !url.pathname.endsWith('/images/create')) {
      res.writeHead(404).end()
      return
    }
    const ref = `${url.searchParams.get('fromImage')}@${url.searchParams.get('tag')}`
    machine.pulls.push(ref)
    res.writeHead(200, { 'content-type': 'application/json' })
    const line = (current: number) =>
      res.write(
        `${JSON.stringify({ status: 'Downloading', id: 'layer-1', progressDetail: { current, total: 4_000_000 } })}\n`
      )
    const finish = () => {
      line(4_000_000)
      const state = read()
      write({ ...state, images: [...new Set([...state.images, ref])] })
      res.end(`${JSON.stringify({ status: `Digest: ${ref.split('@')[1]}` })}\n`)
    }
    line(1_000_000)
    if (machine.holdPull && ref.includes('vllm')) {
      release = finish
      return
    }
    setTimeout(() => line(2_000_000), 200)
    setTimeout(finish, 400)
  })
  await new Promise<void>((resolve) => engineApi.listen(join(dir, 'docker.sock'), resolve))
  return machine
}
