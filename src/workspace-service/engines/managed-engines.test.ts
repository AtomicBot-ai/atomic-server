import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import type { FakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import {
  DIGEST_A,
  DIGEST_B,
  environment,
  installation,
  operation,
  plan,
} from '../../../test/helpers/managed-fixtures.js'
import { managedEngineOperation } from './managed-engines.js'

function link(env = environment(), operations: unknown[] = []): FakeCoreLink {
  const l = fakeCoreLink()
  l.responses['GET /environments'] = { environments: [env] }
  l.snapshotValue = { ...l.snapshotValue, environments: [env], environment_operations: operations as never }
  return l
}
const bodies = (l: FakeCoreLink, path: string) => l.calls.filter((c) => c.path === path).map((c) => c.body)
const run = (l: FakeCoreLink, name: string, input: Record<string, unknown>) =>
  managedEngineOperation(l, name, input)

describe('engines.plan', () => {
  it('probes the engine as a runtime target, by the engine id while nothing is installed', async () => {
    const l = link()
    l.responses['POST /environments/probe'] = plan('vllm')
    l.responses['GET /environments/descriptors/vllm-2026.10.1'] = {
      descriptor_id: 'vllm-2026.10.1',
      notices: ['NVIDIA terms apply.'],
    }
    const state = (await run(l, 'engines.plan', { engine: 'vllm' })) as Record<string, unknown>
    expect(bodies(l, '/environments/probe')).toEqual([
      { descriptor_id: 'vllm', target: { kind: 'runtime', installation_id: 'vllm', engine_id: 'vllm' } },
    ])
    expect(state).toMatchObject({
      engine: 'vllm',
      environment_id: 'default',
      executor: 'linux-docker',
      plan: { plan_digest: DIGEST_A },
      notices: ['NVIDIA terms apply.'],
      installation: null,
      operation: null,
      other_operation: null,
    })
  })

  it("probes by the installation's active descriptor and reports another engine's running operation", async () => {
    const env = environment({ installations: [installation('vllm'), installation('tensorrt-llm')] })
    const l = link(env, [operation('tensorrt-llm', 'pulling-image'), operation('sglang', 'ready')])
    l.responses['POST /environments/probe'] = plan('vllm')
    const state = (await run(l, 'engines.plan', { engine: 'vllm' })) as Record<string, unknown>
    expect(bodies(l, '/environments/probe')[0]).toMatchObject({ descriptor_id: 'vllm-2026.10.1' })
    expect(state).toMatchObject({
      installation: { engine_id: 'vllm', status: 'ready' },
      operation: null,
      other_operation: { operation_id: 'op-tensorrt-llm', phase: 'pulling-image' },
      models_kept_for: ['tensorrt-llm'],
    })
  })

  it('refuses an engine that is not managed', async () => {
    await expect(run(link(), 'engines.plan', { engine: 'llamacpp' })).rejects.toThrow('not a managed engine')
  })
})

describe('engines.operate', () => {
  it('begins a setup with the request id, the descriptor and the approval, the same body on a retry', async () => {
    const l = link()
    l.responses['POST /environments/default/operations'] = operation('vllm', 'checking')
    const input = { engine: 'vllm', kind: 'setup', request_id: 'r-1', approved_plan_digest: DIGEST_A }
    const first = await run(l, 'engines.operate', input)
    const again = await run(l, 'engines.operate', input)
    expect(again).toEqual(first)
    const begun = bodies(l, '/environments/default/operations')
    expect(begun).toEqual([
      {
        request_id: 'r-1',
        kind: 'setup',
        target: { kind: 'runtime', installation_id: 'vllm', engine_id: 'vllm' },
        descriptor_id: 'vllm',
        approved_plan_digest: DIGEST_A,
      },
      begun[0],
    ])
  })

  it('names the installed descriptor for a setup of an installed engine', async () => {
    const l = link(environment({ installations: [installation('sglang', { status: 'failed' })] }))
    await run(l, 'engines.operate', { engine: 'sglang', kind: 'setup', request_id: 'r' })
    expect(bodies(l, '/environments/default/operations')[0]).toMatchObject({
      descriptor_id: 'sglang-2026.10.1',
    })
  })

  it('keeps the models when asked, or when another managed engine is installed', async () => {
    const alone = link(environment({ installations: [installation('sglang')] }))
    await run(alone, 'engines.operate', { engine: 'sglang', kind: 'remove', request_id: 'a' })
    await run(alone, 'engines.operate', {
      engine: 'sglang',
      kind: 'remove',
      request_id: 'b',
      retain_models: true,
    })
    expect(bodies(alone, '/environments/default/operations')).toEqual([
      {
        request_id: 'a',
        kind: 'remove',
        target: { kind: 'runtime', installation_id: 'sglang', engine_id: 'sglang' },
        retain_models: false,
      },
      expect.objectContaining({ request_id: 'b', retain_models: true }),
    ])
    const shared = link(environment({ installations: [installation('vllm'), installation('tensorrt-llm')] }))
    await run(shared, 'engines.operate', { engine: 'vllm', kind: 'remove', request_id: 'c' })
    expect(bodies(shared, '/environments/default/operations')[0]).toMatchObject({ retain_models: true })
  })
})

describe('engines.operation, resume, cancel, diagnostics', () => {
  it('resumes at the revision the core holds, with the approval when given', async () => {
    const l = link()
    l.responses['GET /environments/operations/op-vllm'] = operation('vllm', 'awaiting-consent', {
      revision: 7,
      plan_digest: DIGEST_B,
    })
    expect(await run(l, 'engines.operation', { operation_id: 'op-vllm' })).toMatchObject({ revision: 7 })
    await run(l, 'engines.resume', { operation_id: 'op-vllm', approved_plan_digest: DIGEST_B })
    await run(l, 'engines.resume', { operation_id: 'op-vllm' })
    expect(bodies(l, '/environments/operations/op-vllm/resume')).toEqual([
      { expected_revision: 7, approved_plan_digest: DIGEST_B },
      { expected_revision: 7 },
    ])
    await run(l, 'engines.cancel', { operation_id: 'op-vllm' })
    expect(l.calls.some((c) => c.path === '/environments/operations/op-vllm/cancel')).toBe(true)
  })

  it("reads the environment's diagnostics", async () => {
    const l = link()
    l.responses['GET /environments/default/diagnostics'] = { core_version: '0.18.5' }
    expect(await run(l, 'engines.diagnostics', { engine: 'vllm' })).toEqual({ core_version: '0.18.5' })
  })
})
