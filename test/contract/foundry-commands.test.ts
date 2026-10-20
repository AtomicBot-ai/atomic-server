/** Foundry Local's accelerators from `atc engines` (spec foundry-local-server, "Ускорители Foundry Local"). */
import { AtomicCoreError } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

const NPU = {
  name: 'OpenVINOExecutionProvider',
  execution_provider: 'openvino',
  device: 'gpu/npu',
  prepared: false,
}
const RTX = {
  name: 'NvTensorRTRTXExecutionProvider',
  execution_provider: null,
  device: 'gpu',
  prepared: false,
}
const CPU = { name: 'CPUExecutionProvider', execution_provider: 'cpu', device: 'cpu', prepared: true }
const probe = (accelerators: unknown[]) => ({
  installed: true,
  build: 'v2.1.0/win-x64',
  version: '2.1.0',
  c_api_version: 1,
  probed_at: 1,
  accelerators,
  error: null,
})

/** A Windows host with an NPU: the core's prepare reports its steps, then the NPU is prepared. */
function host(prepare: () => unknown = () => ({ accelerators: [{ name: NPU.name, prepared: true }] })) {
  t = testRun()
  let prepared = false
  t.link.responses['GET /runtimes/foundry-local/accelerators'] = () => probe([{ ...NPU, prepared }, RTX, CPU])
  t.link.responses['GET /runtimes/foundry-local/accelerators?force=1'] = () =>
    probe([{ ...NPU, prepared }, RTX, CPU])
  t.link.responses['POST /runtimes/foundry-local/accelerators/prepare'] = async () => {
    const answer = prepare()
    if (answer instanceof Error) return answer
    for (const [stage, fraction] of [
      ['started', null],
      ['downloading', 0.5],
      ['done', null],
    ] as const) {
      await new Promise((r) => setTimeout(r, 5))
      t.link.emit({
        id: `f:${stage}`,
        event: 'foundry-local:accelerators',
        data: { accelerator: NPU.name, stage, fraction },
      })
    }
    prepared = true
    return answer
  }
}
const prepares = () => t.link.calls.filter((c) => c.path.endsWith('/prepare'))

describe('atc engines accelerators foundry-local', () => {
  it('lists what the library found, prepared or not', async () => {
    host()
    expect(await t.run(['engines', 'accelerators', 'foundry-local'])).toBe(0)
    expect(out()).toMatch(/OpenVINOExecutionProvider\s+openvino\s+gpu\/npu\s+no/)
    expect(out()).toMatch(/CPUExecutionProvider\s+cpu\s+cpu\s+yes/)
  })

  it('asks the library again with --refresh', async () => {
    host()
    expect(await t.run(['engines', 'accelerators', 'foundry-local', '--refresh'])).toBe(0)
    expect(t.link.calls.some((c) => c.path === '/runtimes/foundry-local/accelerators?force=1')).toBe(true)
  })

  it('prepares every unprepared accelerator with an execution provider, showing its progress', async () => {
    host()
    expect(await t.run(['engines', 'accelerators', 'foundry-local', '--prepare'])).toBe(0)
    expect(prepares().map((c) => c.body)).toEqual([{ accelerators: [NPU.name] }])
    expect(err()).toContain(`${NPU.name}: downloading`)
    expect(out()).toContain(`${NPU.name}: prepared`)
  })

  it('refuses to prepare an accelerator no variant runs on', async () => {
    host()
    expect(await t.run(['engines', 'accelerators', 'foundry-local', '--prepare', RTX.name])).toBe(2)
    expect(prepares()).toEqual([])
  })

  it('follows a prepare another client runs instead of failing', async () => {
    let calls = 0
    host(() =>
      ++calls < 2
        ? new AtomicCoreError('ENGINE_INSTALL_IN_PROGRESS', 'A prepare is running.')
        : { accelerators: [{ name: NPU.name, prepared: true }] }
    )
    expect(await t.run(['engines', 'accelerators', 'foundry-local', '--prepare'])).toBe(0)
    expect(prepares().length).toBeGreaterThan(1)
  })

  it('says models run on the CPU when nothing else is there', async () => {
    host()
    t.link.responses['GET /runtimes/foundry-local/accelerators'] = probe([CPU])
    expect(await t.run(['engines', 'accelerators', 'foundry-local', '--prepare'])).toBe(0)
    expect(out()).toContain('run on the CPU')
    expect(prepares()).toEqual([])
  })

  it('says Foundry Local is not available where the core does not register it', async () => {
    t = testRun()
    t.link.responses['GET /runtimes/foundry-local/accelerators'] = new AtomicCoreError(
      'PROVIDER_NOT_FOUND',
      'Foundry Local does not run on this computer.'
    )
    expect(await t.run(['engines', 'accelerators', 'foundry-local'])).toBe(2)
    expect(err()).toContain('not available on this platform')
  })
})

describe('atc engines install foundry-local', () => {
  it('prepares the accelerators after the install, unless --no-accelerators', async () => {
    host()
    t.link.responses['POST /engines/versions'] = { engines: [{ engine: 'foundry-local', active: null }] }
    t.link.responses['POST /engines/foundry-local/update'] = {
      updated: true,
      active: { version: 'v2.1.0', variant: 'win-x64' },
    }
    expect(await t.run(['engines', 'install', 'foundry-local'])).toBe(0)
    expect(prepares()).toHaveLength(1)
    t.link.calls.length = 0
    expect(await t.run(['engines', 'install', 'foundry-local', '--no-accelerators'])).toBe(0)
    expect(prepares()).toEqual([])
  })
})
