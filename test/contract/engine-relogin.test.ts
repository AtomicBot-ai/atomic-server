/** Sign-in and restart on a server (spec managed-engines-server, "Повторный вход и перезагрузка на сервере"). */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { DIGEST_A, operation } from '../helpers/managed-fixtures.js'
import { managedRun } from '../helpers/managed-host.js'
import type { ManagedHost } from '../helpers/managed-host.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')

/** The daemon's record, saying how this server was started. */
function launchedAs(run: TestRun, launch: string, service?: string) {
  const path = atcPathsFor(run.io.env['ATC_DATA_FOLDER'] as string).daemonRecord
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: 1,
      pid: run.link.endpoint.pid,
      instance_id: run.link.endpoint.instanceId,
      state: 'ready',
      atc_version: 'test',
      core_version: '0.18.5',
      control_url: run.link.endpoint.baseUrl,
      admin_url: null,
      started_at: 0,
      launch,
      ...(service ? { service } : {}),
    })
  )
}

function host(engine: string, launch: string, service?: string): ManagedHost {
  const run = managedRun(engine)
  t = run.t
  launchedAs(t, launch, service)
  return run.h
}

describe('relogin-required on a server', () => {
  it.each([
    ['terminal', 'atc restart'],
    ['systemd-user', 'end all your sessions'],
    ['systemd-system', 'sudo systemctl restart atc'],
  ])(
    'a server started as %s: the command prints the steps for it, and ends nothing itself',
    async (launch, text) => {
      const h = host('tensorrt-llm', launch)
      h.onBegin = (op) => void h.play(op.operation_id, [{ phase: 'relogin-required', plan_digest: DIGEST_A }])
      expect(await t.run(['engines', 'install', 'tensorrt-llm', '--yes'])).toBe(0)
      expect(out()).toContain(text)
      expect(out()).toContain('atc engines install --resume op-tensorrt-llm')
    }
  )

  it('names the service the server runs as', async () => {
    const h = host('tensorrt-llm', 'systemd-system', 'atomic')
    h.onBegin = (op) => void h.play(op.operation_id, [{ phase: 'relogin-required', plan_digest: DIGEST_A }])
    expect(await t.run(['engines', 'install', 'tensorrt-llm', '--yes'])).toBe(0)
    expect(out()).toContain('sudo systemctl restart atomic')
  })

  it('continues after the restart with --resume and no new consent', async () => {
    const h = host('tensorrt-llm', 'terminal')
    h.set(operation('tensorrt-llm', 'relogin-required', { approved_plan_digest: DIGEST_A }))
    h.onResume = (op) => void h.play(op.operation_id, [{ phase: 'pulling-image' }, { phase: 'ready' }])
    expect(await t.run(['engines', 'install', '--resume', 'op-tensorrt-llm'])).toBe(0)
    expect(h.resumed).toEqual([{ operation_id: 'op-tensorrt-llm', body: { expected_revision: 3 } }])
    expect(out()).toContain('tensorrt-llm is installed and ready')
  })

  it('atc status prints the same steps for an operation waiting on a sign-in', async () => {
    const h = host('tensorrt-llm', 'systemd-user', 'atomic')
    h.set(operation('tensorrt-llm', 'relogin-required'))
    expect(await t.run(['status'])).toBe(0)
    expect(out()).toContain('end all your sessions')
    expect(out()).toContain('systemctl --user start atomic')
  })
})

describe('reboot-required on Windows', () => {
  it('says a restart is needed and that the next atc start continues', async () => {
    const h = host('vllm', 'terminal')
    h.onBegin = (op) => void h.play(op.operation_id, [{ phase: 'reboot-required', plan_digest: DIGEST_A }])
    expect(await t.run(['engines', 'install', 'vllm', '--yes'])).toBe(0)
    expect(out()).toContain('restart')
    expect(out()).toContain('atc start')
  })
})
