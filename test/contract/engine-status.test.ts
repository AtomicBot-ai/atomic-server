/** `atc engines status|list` for managed engines (spec managed-engines-server, "Состояние и диагностика"). */
import { afterEach, describe, expect, it } from 'vitest'
import { installation, operation, plan } from '../helpers/managed-fixtures.js'
import { managedRun } from '../helpers/managed-host.js'
import type { ManagedHost } from '../helpers/managed-host.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')

/** Ubuntu with an NVIDIA driver and no Docker: every managed engine can be set up, with system changes. */
function linuxWithoutDocker(): ManagedHost {
  const run = managedRun('vllm')
  t = run.t
  const h = run.h
  for (const engine of ['tensorrt-llm', 'vllm', 'sglang']) h.plans[engine] = plan(engine)
  h.versions = ['llamacpp-upstream', 'vllm', 'sglang', 'tensorrt-llm'].map((engine) => ({
    engine: engine as never,
    kind: engine === 'llamacpp-upstream' ? 'llamacpp' : 'managed',
  }))
  return h
}

describe('atc engines status', () => {
  it('shows every managed engine as installable with system changes, none installed, on Linux without Docker', async () => {
    linuxWithoutDocker()
    expect(await t.run(['engines', 'status'])).toBe(0)
    for (const engine of ['tensorrt-llm', 'vllm', 'sglang']) {
      const row = out()
        .split('\n')
        .find((l) => l.startsWith(engine))
      expect(row).toBeDefined()
      expect(row).toContain('not installed')
      expect(row).toContain('needs system changes')
    }
  })

  it('shows one engine in detail: installation, descriptor, its running operation and an update offer', async () => {
    const h = linuxWithoutDocker()
    h.env = { ...h.env, installations: [installation('vllm', { status: 'updating' })] }
    h.set(operation('vllm', 'pulling-image', { kind: 'setup' }))
    h.versions = [
      {
        engine: 'vllm',
        kind: 'managed',
        active: { version: 'vllm-2026.10.1', variant: 'linux/amd64' },
        update: {
          needed: true,
          target: { version: 'vllm-2026.11.1', variant: 'linux/amd64' },
          apply: 'reinstall',
        },
      },
    ]
    expect(await t.run(['engines', 'status', 'vllm'])).toBe(0)
    expect(out()).toContain('vllm-2026.10.1')
    expect(out()).toContain('Downloading the engine image')
    expect(out()).toContain('op-vllm')
    expect(out()).toContain('vllm-2026.11.1')
  })

  it('shows the blockers with their instructions', async () => {
    const h = linuxWithoutDocker()
    h.plans['sglang'] = plan('sglang', {
      availability: 'prerequisite-blocked',
      blockers: [
        {
          code: 'MANAGED_PREREQUISITE_BLOCKED',
          message: 'The NVIDIA driver is too old.',
          commands: ['sudo apt install nvidia-driver-570'],
        },
      ],
    })
    expect(await t.run(['engines', 'status', 'sglang'])).toBe(0)
    expect(out()).toContain('The NVIDIA driver is too old.')
    expect(out()).toContain('sudo apt install nvidia-driver-570')
  })

  it('gives the same data machine-readably with --json', async () => {
    linuxWithoutDocker()
    expect(await t.run(['engines', 'status', '--json'])).toBe(0)
    const doc = JSON.parse(out()) as {
      engines: Array<{ engine: string; managed?: { state: { kind: string } } }>
    }
    expect(doc.engines.map((e) => e.engine)).toEqual(['llamacpp-upstream', 'vllm', 'sglang', 'tensorrt-llm'])
    expect(doc.engines.find((e) => e.engine === 'vllm')?.managed?.state.kind).toBe('installable')
    expect(doc.engines.find((e) => e.engine === 'llamacpp-upstream')?.managed).toBeUndefined()
  })

  it('says a managed engine the core does not register here is not available on this platform', async () => {
    const h = linuxWithoutDocker()
    h.versions = [{ engine: 'llamacpp-upstream' as never, kind: 'llamacpp' }]
    expect(await t.run(['engines', 'status', 'vllm'])).toBe(0)
    expect(out()).toContain('not available on this platform')
  })
})

describe('atc engines list', () => {
  it('offers the update of a managed engine', async () => {
    const h = linuxWithoutDocker()
    h.env = { ...h.env, installations: [installation('vllm')] }
    h.versions = [
      {
        engine: 'vllm',
        kind: 'managed',
        active: { version: 'vllm-2026.10.1', variant: 'linux/amd64' },
        update: {
          needed: true,
          target: { version: 'vllm-2026.11.1', variant: 'linux/amd64' },
          apply: 'reinstall',
        },
      },
    ]
    expect(await t.run(['engines', 'list'])).toBe(0)
    expect(out()).toContain('update available: vllm-2026.11.1')
  })
})
