/**
 * Updating an installed managed engine (spec managed-engines-server, "Обновление managed-движка"): the
 * new release's plan first, the core's reinstall (which removes the installed image) only after consent.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { DIGEST_A, DIGEST_B, installation, operation, plan } from '../helpers/managed-fixtures.js'
import { managedRun } from '../helpers/managed-host.js'
import type { ManagedHost } from '../helpers/managed-host.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

/** vLLM installed at 2026.10.1, the core offering 2026.11.1 whose plan has digest B. */
function host(over: Parameters<typeof managedRun>[1] = {}): { h: ManagedHost; updates: unknown[] } {
  const run = managedRun('vllm', over)
  t = run.t
  const h = run.h
  h.env = { ...h.env, installations: [installation('vllm')] }
  h.versions = [
    {
      engine: 'vllm',
      active: { version: 'vllm-2026.10.1', variant: 'linux/amd64' },
      update: {
        needed: true,
        target: { version: 'vllm-2026.11.1', variant: 'linux/amd64' },
        apply: 'reinstall',
      },
    },
  ]
  h.plans['vllm'] = plan('vllm', { plan_digest: DIGEST_B, descriptor_id: 'vllm-2026.11.1' })
  const updates: unknown[] = []
  t.link.responses['POST /engines/vllm/update'] = (body: unknown) => {
    updates.push(body)
    const requestId = (body as { request_id: string }).request_id
    h.set(operation('vllm', 'removing', { operation_id: 'op-remove', kind: 'remove', request_id: requestId }))
    void h.play('op-remove', [{ phase: 'removed' }]).then(() =>
      h.set(
        operation('vllm', 'awaiting-consent', {
          operation_id: 'op-setup',
          request_id: `${requestId}:setup`,
          plan_digest: DIGEST_B,
        })
      )
    )
    return { operation_id: 'op-remove' }
  }
  h.onResume = (op) => void h.play(op.operation_id, [{ phase: 'pulling-image' }, { phase: 'ready' }])
  return { h, updates }
}
const probedTarget = () =>
  t.link.calls
    .filter((c) => c.path === '/environments/probe')
    .map((c) => (c.body as { descriptor_id: string }).descriptor_id)

describe('atc engines install <installed managed engine with an update>', () => {
  it('without consent and without a terminal prints the new release’s plan and removes nothing', async () => {
    const { updates } = host()
    expect(await t.run(['engines', 'install', 'vllm'])).toBe(2)
    expect(out()).toContain('vllm-2026.10.1 → vllm-2026.11.1')
    expect(out()).toContain(`Plan digest: ${DIGEST_B}`)
    expect(probedTarget()).toContain('vllm-2026.11.1')
    expect(err()).toContain('--yes')
    expect(updates).toEqual([])
  })

  it('with --dry-run prints the plan and removes nothing', async () => {
    const { updates } = host()
    expect(await t.run(['engines', 'install', 'vllm', '--dry-run'])).toBe(0)
    expect(out()).toContain(`Plan digest: ${DIGEST_B}`)
    expect(updates).toEqual([])
  })

  it('asks once on a terminal, then reinstalls and approves the same plan without asking again', async () => {
    const { h, updates } = host({
      io: { isTTY: { stdin: true, stdout: true, stderr: false }, answers: ['y'] },
    })
    expect(await t.run(['engines', 'install', 'vllm'])).toBe(0)
    expect(updates).toHaveLength(1)
    expect(h.resumed).toEqual([
      { operation_id: 'op-setup', body: { expected_revision: 3, approved_plan_digest: DIGEST_B } },
    ])
  })

  it('refuses --approve of another digest before anything begins', async () => {
    const { updates } = host()
    expect(await t.run(['engines', 'install', 'vllm', '--approve', DIGEST_A])).not.toBe(0)
    expect(err()).toContain('MANAGED_PLAN_CHANGED')
    expect(updates).toEqual([])
  })
})

describe('atc engines install <managed> --approve of a plan that is not the one printed', () => {
  it('stops with MANAGED_PLAN_CHANGED before beginning an operation', async () => {
    const run = managedRun('vllm')
    t = run.t
    expect(await t.run(['engines', 'install', 'vllm', '--approve', DIGEST_B])).not.toBe(0)
    expect(err()).toContain('MANAGED_PLAN_CHANGED')
    expect(run.h.begun).toEqual([])
  })
})

describe('atc engines install <managed> while another engine’s operation waits for a person', () => {
  it.each(['awaiting-consent', 'relogin-required', 'reboot-required'] as const)(
    'stops at once naming it (%s) and how to continue it, instead of waiting forever',
    async (phase) => {
      const run = managedRun('vllm')
      t = run.t
      run.h.set(operation('sglang', phase, { operation_id: 'op-sglang' }))
      expect(await t.run(['engines', 'install', 'vllm', '--yes'])).toBe(2)
      expect(err()).toContain('sglang')
      expect(err()).toContain('atc engines install --resume op-sglang')
      expect(run.h.begun).toEqual([])
    },
    10_000
  )
})
