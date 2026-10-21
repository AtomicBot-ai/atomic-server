/** `atc engines rm <managed>` against a scripted core (spec managed-engines-server, "Удаление managed-движка"). */
import { afterEach, describe, expect, it } from 'vitest'
import { DIGEST_B, installation } from '../helpers/managed-fixtures.js'
import { managedRun } from '../helpers/managed-host.js'
import type { ManagedHost } from '../helpers/managed-host.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')
function host(engine = 'vllm'): ManagedHost {
  const run = managedRun(engine)
  t = run.t
  return run.h
}

describe('atc engines rm <managed>', () => {
  /** After a removal begins, the core offers its plan for consent; once approved it removes. */
  function removal(h: ManagedHost) {
    h.onBegin = (op) => void h.play(op.operation_id, [{ phase: 'awaiting-consent', plan_digest: DIGEST_B }])
    h.onResume = (op) => void h.play(op.operation_id, [{ phase: 'removing' }, { phase: 'removed' }])
  }

  it('keeps the models for the other installed engine, says so, and removes after consent', async () => {
    const h = host()
    h.env = { ...h.env, installations: [installation('vllm'), installation('tensorrt-llm')] }
    removal(h)
    expect(await t.run(['engines', 'rm', 'vllm', '--yes'])).toBe(0)
    expect(out()).toContain('Plan to remove vllm')
    expect(out()).toContain('kept for tensorrt-llm')
    expect(h.begun).toEqual([expect.objectContaining({ kind: 'remove', retain_models: true })])
    expect(h.resumed).toEqual([
      { operation_id: 'op-vllm', body: { expected_revision: 2, approved_plan_digest: DIGEST_B } },
    ])
    expect(out()).toContain('vllm was removed')
  })

  it('keeps the models of the last engine with --keep-models, needing no --build', async () => {
    const h = host('sglang')
    h.env = { ...h.env, installations: [installation('sglang')] }
    removal(h)
    expect(await t.run(['engines', 'rm', 'sglang', '--keep-models', '--yes'])).toBe(0)
    expect(out()).toContain('kept')
    expect(h.begun).toEqual([expect.objectContaining({ kind: 'remove', retain_models: true })])
  })

  it('removes the models with the last engine by default, and says so before consent', async () => {
    const h = host('sglang')
    h.env = { ...h.env, installations: [installation('sglang')] }
    removal(h)
    expect(await t.run(['engines', 'rm', 'sglang', '--yes'])).toBe(0)
    expect(out()).toMatch(/models .*removed/i)
    expect(h.begun).toEqual([expect.objectContaining({ kind: 'remove', retain_models: false })])
  })

  it('asks for consent without a terminal and begins nothing', async () => {
    const h = host()
    h.env = { ...h.env, installations: [installation('vllm')] }
    expect(await t.run(['engines', 'rm', 'vllm'])).toBe(2)
    expect(h.begun).toEqual([])
  })

  it('still needs --build for an engine that is not managed', async () => {
    t = testRun()
    expect(await t.run(['engines', 'rm', 'llamacpp', '--yes'])).toBe(2)
    expect(err()).toContain('--build')
  })
})

describe('atc engines rm <managed> --approve', () => {
  function removal(h: ManagedHost) {
    h.onBegin = (op) => void h.play(op.operation_id, [{ phase: 'awaiting-consent', plan_digest: DIGEST_B }])
    h.onResume = (op) => void h.play(op.operation_id, [{ phase: 'removing' }, { phase: 'removed' }])
  }

  it('prints the removal plan’s digest and removes with that digest approved', async () => {
    const h = host()
    h.env = { ...h.env, installations: [installation('vllm')] }
    removal(h)
    expect(await t.run(['engines', 'rm', 'vllm', '--approve', DIGEST_B])).toBe(0)
    expect(out()).toContain(`Removal digest: ${DIGEST_B}`)
    expect(h.resumed).toEqual([
      { operation_id: 'op-vllm', body: { expected_revision: 2, approved_plan_digest: DIGEST_B } },
    ])
  })

  it('refuses another digest, cancels the removal it began, and removes nothing', async () => {
    const h = host()
    h.env = { ...h.env, installations: [installation('vllm')] }
    removal(h)
    expect(await t.run(['engines', 'rm', 'vllm', '--approve', `sha256:${'c'.repeat(64)}`])).not.toBe(0)
    expect(err()).toContain('MANAGED_PLAN_CHANGED')
    expect(h.resumed).toEqual([])
    expect(t.link.calls.some((c) => c.path === '/environments/operations/op-vllm/cancel')).toBe(true)
  })
})
