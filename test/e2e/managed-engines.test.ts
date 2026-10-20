/**
 * Managed engines through the built `atc` (task 2.6): a real daemon whose core runs on the core's fake
 * Linux machine (`ATOMIC_MANAGED_TEST_HOST`, `test/helpers/fake-managed-machine.ts`) — Docker with the
 * NVIDIA runtime already there, so the plan adopts it and no privileged step runs. Nothing here runs a
 * real Docker. The fake machine's commands are `#!/bin/sh` wrappers, so this runs everywhere but
 * Windows, as in the core.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { fakeManagedMachine } from '../helpers/fake-managed-machine.js'
import type { FakeManagedMachine } from '../helpers/fake-managed-machine.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-managed-'))
const dataFolder = join(scratch, 'data')
let machine: FakeManagedMachine
let env: NodeJS.ProcessEnv

const args = (rest: string[]) => [...ATC.slice(1), ...rest, '--data-folder', dataFolder]

/**
 * Never `spawnSync`: the fake machine's conf and Docker Engine API are servers in this process, and a
 * blocked event loop would leave the core waiting on them until its fetch times out.
 */
function atc(...rest: string[]): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(ATC[0] as string, args(rest), { env })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
  return new Promise((resolve) => child.on('exit', (code) => resolve({ code, out, err })))
}

const status = async () =>
  JSON.parse((await atc('engines', 'status', 'vllm', '--json')).out) as {
    engines: Array<{ managed: { installation: { status: string } | null; operation: unknown } }>
  }

beforeAll(async () => {
  if (process.platform === 'win32') return
  machine = await fakeManagedMachine()
  env = {
    ...process.env,
    NO_COLOR: '1',
    ...machine.env,
    // Keeps the suite off the real per-user managed state, as the core's own e2e does.
    ATOMIC_CORE_MANAGED_ROOT: join(scratch, 'managed'),
  }
  const started = await atc('start', '--admin-port', '0', '--json')
  if (started.code !== 0) throw new Error(`atc start failed: ${started.err}`)
})

afterAll(async () => {
  if (process.platform === 'win32') return
  await atc('stop', '--force', '--kill')
  await machine.close()
  rmSync(machine.dir, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')(`managed engines (${ATC.join(' ')})`, () => {
  it('refuses without consent and without a terminal, printing the plan, and begins no operation', async () => {
    const res = await atc('engines', 'install', 'vllm')
    expect(res.code, res.err).toBe(2)
    expect(res.out).toMatch(/Plan digest: sha256:[0-9a-f]{64}/)
    expect(res.out).toContain('No system changes')
    expect((await status()).engines[0]?.managed.operation).toBeNull()
  })

  it('begins with --yes, detaches, and --resume follows the pull to ready', async () => {
    machine.holdPull = true
    const detached = await atc('engines', 'install', 'vllm', '--yes', '--detach')
    expect(detached.code, detached.err).toBe(0)
    const op = /--resume (\S+)/.exec(detached.out)?.[1]
    expect(op).toBeDefined()
    const resumed = atc('engines', 'install', '--resume', op!)
    await new Promise((r) => setTimeout(r, 1500))
    machine.holdPull = false
    machine.releasePull()
    const res = await resumed
    expect(res.code, res.err).toBe(0)
    expect(res.out).toContain('vllm is installed and ready')
    expect(res.err).toContain('Downloading the engine image')
    expect((await status()).engines[0]?.managed.installation?.status).toBe('ready')
  })

  it('removes vllm keeping the models', async () => {
    const res = await atc('engines', 'rm', 'vllm', '--keep-models', '--yes')
    expect(res.code, res.err).toBe(0)
    expect(res.out).toContain('kept as asked')
    expect(res.out).toContain('vllm was removed')
    expect((await status()).engines[0]?.managed.installation?.status ?? 'absent').not.toBe('ready')
  })
})
