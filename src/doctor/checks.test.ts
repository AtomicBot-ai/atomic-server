import { describe, expect, it } from 'vitest'
import type { ManagedEngineState } from '../contract/index.js'
import { plan } from '../../test/helpers/managed-fixtures.js'
import { CHECKS, runChecks, worstStatus } from './checks.js'
import { MANAGED_CHECKS } from './managed-checks.js'
import type { Check } from './checks.js'

describe('runChecks', () => {
  it('runs every check, catches throws, and summarises', async () => {
    const checks: Check[] = [
      { id: 'a', title: 'A', run: async () => ({ status: 'ok', message: 'fine' }) },
      { id: 'b', title: 'B', run: async () => ({ status: 'warn', message: 'meh' }) },
      {
        id: 'c',
        title: 'C',
        run: async () => {
          throw new Error('boom')
        },
      },
    ]
    const results = await runChecks(checks, {} as never)
    expect(results.map((r) => r.status)).toEqual(['ok', 'warn', 'fail'])
    expect(results[2]?.message).toBe('boom')
    expect(worstStatus(results)).toBe('fail')
    expect(worstStatus(results.slice(0, 2))).toBe('warn')
    expect(worstStatus(results.slice(0, 1))).toBe('ok')
  })
})

describe('install check', () => {
  it.each([
    [{ path: '/usr/bin/atc', kind: 'deb' }, '/usr/bin/atc (the deb package)'],
    [{ path: '/home/u/.local/bin/atc', kind: 'release' }, '/home/u/.local/bin/atc (a release binary)'],
  ] as const)('reports %o', async (install, message) => {
    const check = CHECKS.find((c) => c.id === 'install')!
    expect(await check.run({ install } as never)).toEqual({ status: 'ok', message })
  })
})

describe('gpu check', () => {
  const gpu = (name: string, vendor: string, driver: string) => ({
    name,
    vendor,
    driver_version: driver,
    total_memory: 8192,
    uuid: '',
    nvidia_info: null,
    vulkan_info: null,
  })
  const info = (gpus: ReturnType<typeof gpu>[], warnings: string[] = []) => ({
    info: { gpus } as never,
    source: 'probe' as const,
    probed_at: 0,
    warnings,
  })
  // The core is the only source of hardware facts; the check never measures the machine itself.
  const host = new Proxy({}, { get: () => () => expect.fail('the gpu check must not probe the host') })
  const run = (hardware: () => Promise<ReturnType<typeof info> | undefined>) =>
    CHECKS.find((c) => c.id === 'gpu')!.run({ host, hardware } as never)

  it.each([
    [
      'what the core detected, any vendor',
      info([gpu('Radeon RX 7900', 'AMD', ''), gpu('RTX 4090', 'NVIDIA', '581.42')]),
      { status: 'ok', message: 'Radeon RX 7900 (AMD); RTX 4090 (NVIDIA, driver 581.42)' },
    ],
    ['no GPU', info([]), { status: 'ok', message: 'the core lists no GPU' }],
    [
      'what the probe could not read',
      info([], ['vulkaninfo not found']),
      {
        status: 'warn',
        message: 'the core lists no GPU',
        hint: 'vulkaninfo not found',
      },
    ],
  ] as const)('reports %s', async (_name, answer, expected) => {
    expect(await run(async () => answer)).toEqual(expected)
  })

  // A server of another build (after `atc update`) or a foreign owner: doctor still finishes.
  it('warns when the server cannot answer', async () => {
    expect(
      await run(async () => {
        throw new Error('The running server is from another build.')
      })
    ).toEqual({
      status: 'warn',
      message: 'could not ask the server: The running server is from another build.',
    })
  })

  it('skips without a running server', async () => {
    expect(await run(async () => undefined)).toEqual({
      status: 'skip',
      message: 'the server is not running; start it to see what the core detected',
    })
  })
})

describe('managed environment checks', () => {
  const row = (results: Awaited<ReturnType<typeof runChecks>>, id: string) =>
    results.find((r) => r.id === id)!
  const linux = (states: ManagedEngineState[], diagnostics: unknown = null) =>
    runChecks(MANAGED_CHECKS, {
      host: { facts: { platform: 'linux' } },
      managed: async () => ({ engines: states, diagnostics }),
    } as never)
  const state = (engine: string, over: Partial<ManagedEngineState> = {}): ManagedEngineState => ({
    engine,
    environment_id: 'default',
    executor: 'linux-docker',
    plan: plan(engine),
    plan_error: null,
    notices: [],
    installation: null,
    operation: null,
    other_operation: null,
    failed: null,
    models_kept_for: [],
    update: null,
    ...over,
  })
  const gpus = {
    environment: { gpus: [{ name: 'RTX 4090', driver_version: '590.44.01' }], distribution: null },
  }

  it('marks every managed check not applicable on macOS, asking nothing', async () => {
    const results = await runChecks(MANAGED_CHECKS, {
      host: { facts: { platform: 'darwin' } },
      managed: async () => expect.fail('nothing to ask on macOS'),
    } as never)
    expect(results.map((r) => r.status)).toEqual(results.map(() => 'skip'))
    expect(results.every((r) => r.message.includes('not applicable'))).toBe(true)
  })

  it('skips with a hint while the server is not running', async () => {
    const results = await runChecks(MANAGED_CHECKS, {
      host: { facts: { platform: 'linux' } },
      managed: async () => undefined,
    } as never)
    expect(row(results, 'managed-engines')).toMatchObject({ status: 'skip' })
    expect(row(results, 'managed-engines').message).toContain('server')
  })

  it('names what setup would change on a host without Docker, in the core’s words', async () => {
    const changes = [
      { code: 'install-packages', text: 'Install docker-ce, nvidia-container-toolkit.' },
      { code: 'add-user-to-docker-group', text: 'Add user u to the docker group.' },
      { code: 'configure-nvidia-runtime', text: 'Configure the NVIDIA runtime for Docker.' },
    ]
    const results = await linux(
      ['tensorrt-llm', 'vllm'].map((e) => state(e, { plan: plan(e, { system_changes: changes }) })),
      gpus
    )
    expect(row(results, 'managed-engines')).toMatchObject({ status: 'ok' })
    expect(row(results, 'managed-driver')).toMatchObject({ status: 'ok' })
    expect(row(results, 'managed-driver').message).toContain('590.44.01')
    const docker = row(results, 'managed-docker')
    expect(docker.status).toBe('warn')
    expect(docker.message).toContain('Install docker-ce, nvidia-container-toolkit.')
    expect(docker.message).toContain('Add user u to the docker group.')
    expect(docker.hint).toContain('atc engines install')
    expect(row(results, 'managed-toolkit')).toMatchObject({ status: 'warn' })
    expect(row(results, 'managed-wsl')).toMatchObject({ status: 'skip' })
  })

  it('is all ok on a host whose Docker with the GPU runtime is adopted as it is', async () => {
    const adopted = plan('vllm', { system_changes: [], adopts_existing_engine: true })
    const results = await linux([state('vllm', { plan: adopted })], gpus)
    for (const id of ['managed-engines', 'managed-driver', 'managed-docker', 'managed-toolkit'])
      expect(row(results, id).status).toBe('ok')
  })

  it('fails the driver check with the blocker of each engine that has one, and its commands', async () => {
    const blocked = plan('tensorrt-llm', {
      availability: 'prerequisite-blocked',
      blockers: [
        {
          code: 'MANAGED_PREREQUISITE_BLOCKED',
          message: 'The NVIDIA driver 535 is older than 570 this release needs.',
          reason: 'driver-too-old',
          commands: ['sudo apt install nvidia-driver-570'],
        },
      ],
    })
    const results = await linux([state('tensorrt-llm', { plan: blocked }), state('vllm')], gpus)
    const driver = row(results, 'managed-driver')
    expect(driver.status).toBe('fail')
    expect(driver.message).toContain('tensorrt-llm: The NVIDIA driver 535 is older')
    expect(driver.hint).toContain('sudo apt install nvidia-driver-570')
  })

  it('checks WSL and the distribution on Windows', async () => {
    const wsl = (over: Partial<ManagedEngineState>) => state('vllm', { executor: 'wsl-docker', ...over })
    const before = await linux([wsl({})], { environment: { gpus: [], distribution: null } })
    expect(row(before, 'managed-wsl')).toMatchObject({ status: 'warn' })
    expect(row(before, 'managed-wsl').message).toContain('not imported')
    const old = plan('vllm', {
      availability: 'prerequisite-blocked',
      blockers: [
        {
          code: 'MANAGED_PREREQUISITE_BLOCKED',
          message: 'WSL 2.0 is older than 2.4.',
          reason: 'wsl-version',
        },
      ],
    })
    expect(row(await linux([wsl({ plan: old })]), 'managed-wsl')).toMatchObject({ status: 'fail' })
    const imported = await linux([wsl({})], {
      environment: { gpus: [], distribution: { name: 'AtomicChat', path: 'C:\\x', size_bytes: 1 } },
    })
    expect(row(imported, 'managed-wsl')).toMatchObject({ status: 'ok' })
  })
})
