/** `atc engines install|rm|status` for managed engines against a scripted core (spec managed-engines-server). */
import { afterEach, describe, expect, it } from 'vitest'
import { DIGEST_A, DIGEST_B, installation, operation, plan } from '../helpers/managed-fixtures.js'
import { IMAGE, managedRun, toReady } from '../helpers/managed-host.js'
import type { ManagedHost } from '../helpers/managed-host.js'
import type { TestRun } from '../helpers/test-context.js'
import { waitFor } from '../helpers/wait-for.js'

let t: TestRun
afterEach(() => t?.cleanup())
function host(engine = 'vllm', over: Parameters<typeof managedRun>[1] = {}): ManagedHost {
  const run = managedRun(engine, over)
  t = run.t
  return run.h
}

const out = () => t.io.out.join('')
const err = () => t.io.err.join('')
describe('atc engines install <managed>', () => {
  it('prints the whole plan, begins with the printed digest under --yes, and follows the pull to ready', async () => {
    const h = host()
    toReady(h)
    expect(await t.run(['engines', 'install', 'vllm', '--yes'])).toBe(0)
    for (const text of [
      'Install Docker Engine from Docker’s apt repository.',
      'Add user u to the docker group.',
      'Download: 8.4 GiB',
      'Disk needed: 18.6 GiB',
      '93.1 GiB free at /var/lib/docker',
      'administrator',
      'sign in again',
      'Use of the engine image is subject to the NVIDIA terms.',
      `Plan digest: ${DIGEST_A}`,
    ])
      expect(out()).toContain(text)
    expect(h.begun).toEqual([
      expect.objectContaining({ kind: 'setup', descriptor_id: 'vllm', approved_plan_digest: DIGEST_A }),
    ])
    expect(String(h.begun[0]!['request_id'])).toMatch(/^[0-9a-f-]{36}$/)
    expect(err()).toContain('Downloading the engine image')
    expect(err()).toContain('Verifying')
    expect(out()).toContain('vllm is installed and ready')
  })

  it('asks on a terminal and begins only after a yes', async () => {
    const h = host('vllm', { io: { isTTY: { stdin: true, stdout: true, stderr: false }, answers: ['y'] } })
    toReady(h)
    expect(await t.run(['engines', 'install', 'vllm'])).toBe(0)
    expect(h.begun).toEqual([expect.objectContaining({ approved_plan_digest: DIGEST_A })])
  })

  it('refuses without a terminal and without --yes or --approve, printing the plan and digest, and begins nothing', async () => {
    const h = host('sglang')
    expect(await t.run(['engines', 'install', 'sglang'])).toBe(2)
    expect(out()).toContain(`Plan digest: ${DIGEST_A}`)
    expect(err()).toContain('--approve')
    expect(h.begun).toEqual([])
  })

  it('stops with MANAGED_PLAN_CHANGED and prints the new plan when --approve names another plan', async () => {
    const h = host('tensorrt-llm')
    h.onBegin = (op) => {
      h.plans['tensorrt-llm'] = plan('tensorrt-llm', { plan_digest: DIGEST_B })
      void h.play(op.operation_id, [
        {
          phase: 'awaiting-consent',
          plan_digest: DIGEST_B,
          error: { code: 'MANAGED_PLAN_CHANGED', message: 'The plan changed.' },
        },
      ])
    }
    expect(await t.run(['engines', 'install', 'tensorrt-llm', '--approve', DIGEST_A])).toBe(1)
    expect(h.begun).toEqual([expect.objectContaining({ approved_plan_digest: DIGEST_A })])
    expect(out()).toContain(`Plan digest: ${DIGEST_B}`)
    expect(err()).toContain('MANAGED_PLAN_CHANGED')
    expect(h.resumed).toEqual([])
  })

  it('prints each blocker with its instructions on a blocked host and offers nothing', async () => {
    const h = host()
    h.plans['vllm'] = plan('vllm', {
      availability: 'prerequisite-blocked',
      blockers: [
        {
          code: 'MANAGED_PREREQUISITE_BLOCKED',
          message: 'No NVIDIA driver was found.',
          reason: 'driver-missing',
          commands: ['sudo ubuntu-drivers install'],
        },
      ],
    })
    expect(await t.run(['engines', 'install', 'vllm', '--yes'])).toBe(1)
    expect(out()).toContain('No NVIDIA driver was found.')
    expect(out()).toContain('sudo ubuntu-drivers install')
    expect(err()).toContain('MANAGED_PREREQUISITE_BLOCKED')
    expect(out()).not.toContain('Plan digest')
    expect(h.begun).toEqual([])
  })

  it('detaches once the operation began, saying how to follow it, and cancels nothing', async () => {
    const h = host()
    h.onBegin = (op) => void h.play(op.operation_id, [{ phase: 'pulling-image' }])
    expect(await t.run(['engines', 'install', 'vllm', '--yes', '--detach'])).toBe(0)
    expect(out()).toContain('atc engines install --resume op-vllm')
    expect(t.link.calls.some((c) => c.path.endsWith('/cancel'))).toBe(false)
  })

  it('stops following on Ctrl-C, leaves the operation running, and says how to follow it again', async () => {
    let interrupt: (() => void) | undefined
    const h = host('vllm', {
      io: {
        onInterrupt: (handler) => {
          interrupt = handler
          return () => (interrupt = undefined)
        },
      },
    })
    h.onBegin = (op) =>
      void h.play(op.operation_id, [
        { phase: 'pulling-image', progress: { ...IMAGE, completed: 1, total: 9 } },
      ])
    const running = t.run(['engines', 'install', 'vllm', '--yes'])
    await waitFor(
      async () => h.operations.get('op-vllm')?.phase === 'pulling-image' && interrupt !== undefined
    )
    interrupt!()
    expect(await running).toBe(130)
    expect(out()).toContain('atc engines install --resume op-vllm')
    expect(t.link.calls.some((c) => c.path.endsWith('/cancel'))).toBe(false)
  })

  it('resumes an operation and asks consent again for the new plan the core offers', async () => {
    const h = host()
    h.plans['vllm'] = plan('vllm', { plan_digest: DIGEST_B })
    h.set(operation('vllm', 'awaiting-consent', { plan_digest: DIGEST_B, approved_plan_digest: DIGEST_A }))
    h.onResume = (op) => void h.play(op.operation_id, [{ phase: 'pulling-image' }, { phase: 'ready' }])
    expect(await t.run(['engines', 'install', '--resume', 'op-vllm'])).toBe(2)
    expect(out()).toContain(`Plan digest: ${DIGEST_B}`)
    expect(h.resumed).toEqual([])
    t.io.out.length = 0
    expect(await t.run(['engines', 'install', '--resume', 'op-vllm', '--yes'])).toBe(0)
    expect(h.resumed).toEqual([
      { operation_id: 'op-vllm', body: { expected_revision: 3, approved_plan_digest: DIGEST_B } },
    ])
    expect(out()).toContain('vllm is installed and ready')
  })

  it('continues a failed operation with --resume and follows it', async () => {
    const h = host()
    h.set(operation('vllm', 'failed', { error: { code: 'MANAGED_STOP_UNCONFIRMED', message: 'x' } }))
    h.onResume = (op) =>
      void h.play(op.operation_id, [{ phase: 'pulling-image', error: null }, { phase: 'ready' }])
    expect(await t.run(['engines', 'install', '--resume', 'op-vllm'])).toBe(0)
    expect(h.resumed).toEqual([{ operation_id: 'op-vllm', body: { expected_revision: 3 } }])
  })

  it('asks the core to cancel and says when it stops at the next safe boundary', async () => {
    const h = host()
    h.set(operation('vllm', 'pulling-image', { cancellation_requested: true }))
    expect(await t.run(['engines', 'install', '--cancel', 'op-vllm'])).toBe(0)
    expect(t.link.calls.some((c) => c.path === '/environments/operations/op-vllm/cancel')).toBe(true)
    expect(out()).toContain('safe')
  })

  it("waits for another engine's operation, then offers this engine's plan", async () => {
    const h = host()
    h.plans['vllm'] = plan('vllm')
    h.set(operation('tensorrt-llm', 'pulling-image'))
    toReady(h)
    const running = t.run(['engines', 'install', 'vllm', '--yes'])
    await waitFor(async () => err().includes('tensorrt-llm'))
    expect(h.begun).toEqual([])
    await h.play('op-tensorrt-llm', [{ phase: 'ready' }])
    expect(await running).toBe(0)
    expect(h.begun).toEqual([expect.objectContaining({ kind: 'setup', approved_plan_digest: DIGEST_A })])
  })

  it('updates an installed engine: follows the reinstall, then asks consent for the new setup', async () => {
    const h = host()
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
    t.link.responses['POST /engines/vllm/update'] = (body: unknown) => {
      const requestId = (body as { request_id: string }).request_id
      h.set(
        operation('vllm', 'removing', { operation_id: 'op-remove', kind: 'remove', request_id: requestId })
      )
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
    expect(await t.run(['engines', 'install', 'vllm', '--yes'])).toBe(0)
    expect(out()).toContain(`Plan digest: ${DIGEST_B}`)
    expect(h.resumed).toEqual([
      { operation_id: 'op-setup', body: { expected_revision: 3, approved_plan_digest: DIGEST_B } },
    ])
  })

  it('says an installed engine with nothing newer is ready and begins nothing', async () => {
    const h = host('tensorrt-llm')
    h.versions = [
      { engine: 'tensorrt-llm', active: { version: 'tensorrt-llm-2026.10.1', variant: 'linux/amd64' } },
    ]
    expect(await t.run(['engines', 'install', 'tensorrt-llm'])).toBe(0)
    expect(out()).toContain('tensorrt-llm is installed and ready')
    expect(h.begun).toEqual([])
  })

  it('writes the plan and then each change of the operation as one NDJSON line with --json', async () => {
    const h = host()
    toReady(h)
    expect(await t.run(['engines', 'install', 'vllm', '--yes', '--json'])).toBe(0)
    const lines = out()
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines[0]).toMatchObject({ plan: { engine: 'vllm', plan: { plan_digest: DIGEST_A } } })
    const phases = lines.slice(1).map((l) => (l['operation'] as { phase: string }).phase)
    expect(phases.at(-1)).toBe('ready')
    expect(phases).toContain('pulling-image')
  })
})
