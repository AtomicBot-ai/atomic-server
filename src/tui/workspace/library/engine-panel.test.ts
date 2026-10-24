import { describe, expect, it } from 'vitest'
import type { ManagedEngineState, WorkspaceSnapshot } from '../../../contract/index.js'
import { DIGEST_A, installation, operation, plan } from '../../../../test/helpers/managed-fixtures.js'
import { enginePanelModel, panelRefreshKey } from './engine-panel-model.js'
import type { EnginePanel } from './engine-panel-model.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'

function state(over: Partial<ManagedEngineState> = {}): ManagedEngineState {
  return {
    engine: 'vllm',
    environment_id: 'default',
    executor: 'linux-docker',
    plan: plan('vllm'),
    plan_error: null,
    notices: [],
    installation: null,
    operation: null,
    other_operation: null,
    failed: null,
    models_kept_for: [],
    update: null,
    ...over,
  }
}
const panel = (over: Partial<EnginePanel> = {}): EnginePanel => ({
  engine: 'vllm',
  kind: 'managed',
  summary: '',
  mode: 'engine',
  form: null,
  foundry: null,
  state: state(),
  busy: false,
  error: '',
  notice: '',
  removing: false,
  keepModels: false,
  launch: 'terminal',
  seen: '',
  ...over,
})
/** A snapshot whose engines and host steps are `engines` and `steps`. */
const live = (engines: WorkspaceSnapshot['engines'], steps: WorkspaceSnapshot['host_steps'] = []) =>
  ({ engines, host_steps: steps }) as WorkspaceSnapshot
const text = (m: ReturnType<typeof enginePanelModel>) => m.lines.map((l) => l.text).join('\n')
const ids = (m: ReturnType<typeof enginePanelModel>) => m.buttons.map((b) => b.id)

describe('the managed engine panel', () => {
  it('shows the whole plan and an Approve that carries the digest it shows', () => {
    const m = enginePanelModel(panel(), live([]))
    expect(text(m)).toContain(DIGEST_A)
    expect(m.buttons.find((b) => b.id === 'engine-approve')?.digest).toBe(DIGEST_A)
  })

  it('shows blockers with their commands and no Approve', () => {
    const blocked = plan('vllm', {
      availability: 'prerequisite-blocked',
      blockers: [{ code: 'MANAGED_PREREQUISITE_BLOCKED', message: 'No driver.', commands: ['sudo fix'] }],
    })
    const m = enginePanelModel(panel({ state: state({ plan: blocked }) }), live([]))
    expect(text(m)).toContain('sudo fix')
    expect(ids(m)).not.toContain('engine-approve')
  })

  it('shows the operation from the snapshot with its phase and bytes, and Cancel', () => {
    const pulling = operation('vllm', 'pulling-image', {
      progress: { unit: 'bytes', completed: 512 * 1024 ** 2, total: 1024 ** 3 } as never,
    })
    const m = enginePanelModel(panel(), live([{ engine: 'vllm', installation: null, operation: pulling }]))
    expect(text(m)).toMatch(/512\.0 MiB.*1\.0 GiB/)
    expect(ids(m)).toContain('engine-cancel')
  })

  it('asks again when the operation waits for consent to a plan other than the one shown', () => {
    const asking = operation('vllm', 'awaiting-consent', { plan_digest: `sha256:${'b'.repeat(64)}` })
    const m = enginePanelModel(panel(), live([{ engine: 'vllm', installation: null, operation: asking }]))
    expect(ids(m)).not.toContain('engine-approve')
    expect(text(m)).toMatch(/plan changed/i)
  })

  it('approves a waiting operation with the digest of the plan it shows when they match', () => {
    const asking = operation('vllm', 'awaiting-consent', { plan_digest: DIGEST_A })
    const m = enginePanelModel(panel(), live([{ engine: 'vllm', installation: null, operation: asking }]))
    expect(m.buttons.find((b) => b.id === 'engine-approve')?.digest).toBe(DIGEST_A)
  })

  it('shows the privileged step with the command to run, and moves on by itself', () => {
    const waiting = operation('vllm', 'preparing-host', { pending_host_step: { step_id: 's1' } as never })
    const step = {
      step_id: 's1',
      operation_id: waiting.operation_id,
      instructions: 'sudo atc host-step exec /r/s1.json',
      updated_at: 1,
    }
    const m = enginePanelModel(
      panel(),
      live([{ engine: 'vllm', installation: null, operation: waiting }], [step])
    )
    expect(text(m)).toContain('sudo atc host-step exec /r/s1.json')
    expect(m.lines.find((l) => l.text.includes('host-step exec'))?.tone).toBe('command')
  })

  it.each([
    ['terminal', 'atc restart'],
    ['systemd-system', 'sudo systemctl restart atc'],
  ] as const)('gives the sign-in instruction for a server run as %s, and Continue', (launch, words) => {
    const relogin = operation('vllm', 'relogin-required')
    const m = enginePanelModel(
      panel({ launch }),
      live([{ engine: 'vllm', installation: null, operation: relogin }])
    )
    expect(text(m)).toContain(words)
    expect(ids(m)).toContain('engine-resume')
  })

  it('shows why a failed setup failed (Docker’s answer), and no Retry while another engine’s setup runs', () => {
    const failed = operation('vllm', 'failed', {
      error: {
        code: 'IO_ERROR',
        message: 'Docker image pull failed with status 500.',
        details: '{"message":"unexpected status from HEAD request to https://nvcr.io/v2/: 403 Forbidden"}',
      } as never,
    })
    const p = panel({ state: state({ failed }) })
    const alone = enginePanelModel(p, live([{ engine: 'vllm', installation: null, operation: null }]))
    expect(text(alone)).toContain('nvcr.io/v2/: 403 Forbidden')
    expect(ids(alone)).toContain('engine-resume')
    const busy = enginePanelModel(
      p,
      live([
        { engine: 'vllm', installation: null, operation: null },
        { engine: 'sglang', installation: null, operation: operation('sglang', 'pulling-image') },
      ])
    )
    expect(text(busy)).toMatch(/The setup of sglang runs first .*vllm is next/)
    expect(ids(busy)).not.toContain('engine-resume')
  })

  it('offers no Agree and update for a new release this machine cannot run', () => {
    const blocked = state({ plan: plan('vllm', { availability: 'prerequisite-blocked' }) })
    const ready = live([{ engine: 'vllm', installation: installation('vllm'), operation: null }])
    const m = enginePanelModel(panel({ offer: { from: 'vllm-1', target: 'vllm-2', state: blocked } }), ready)
    expect(ids(m)).not.toContain('engine-update-confirm')
    expect(ids(m)).toContain('engine-update-cancel')
  })

  it('names the service the server runs as', () => {
    const relogin = operation('vllm', 'relogin-required')
    const m = enginePanelModel(
      panel({ launch: 'systemd-system', service: 'atomic' }),
      live([{ engine: 'vllm', installation: null, operation: relogin }])
    )
    expect(text(m)).toContain('sudo systemctl restart atomic')
  })

  it('says another engine’s operation runs first and offers no Approve meanwhile', () => {
    const other = operation('sglang', 'pulling-image')
    const m = enginePanelModel(panel(), live([{ engine: 'sglang', installation: null, operation: other }]))
    expect(text(m)).toMatch(/sglang.*next|after/i)
    expect(ids(m)).not.toContain('engine-approve')
  })

  it('offers Remove for a ready engine, then the removal plan with keep models', () => {
    const ready = live([{ engine: 'vllm', installation: installation('vllm'), operation: null }])
    expect(ids(enginePanelModel(panel(), ready))).toContain('engine-remove')
    const m = enginePanelModel(panel({ removing: true, keepModels: true }), ready)
    expect(ids(m)).toEqual(expect.arrayContaining(['engine-keep-models', 'engine-remove-confirm']))
    expect(m.buttons.find((b) => b.id === 'engine-keep-models')?.label).toMatch(/keep models: on/i)
  })

  it('offers Update when the core has a newer release', () => {
    const m = enginePanelModel(
      panel({
        state: state({
          installation: installation('vllm'),
          update: {
            needed: true,
            target: { version: 'vllm-2', variant: 'linux/amd64' },
            apply: 'reinstall',
          } as never,
        }),
      }),
      live([{ engine: 'vllm', installation: installation('vllm'), operation: null }])
    )
    expect(ids(m)).toContain('engine-update')
  })

  it('re-reads the plan when the live operation changes phase, once per phase', () => {
    const p = panel()
    const pulling = live([
      { engine: 'vllm', installation: null, operation: operation('vllm', 'pulling-image') },
    ])
    expect(panelRefreshKey(p, pulling)).not.toBe(p.seen)
    expect(panelRefreshKey({ ...p, seen: panelRefreshKey(p, pulling) }, pulling)).toBe(
      panelRefreshKey(p, pulling)
    )
  })
})

describe('the drawn panel', () => {
  it.each([
    [80, 24],
    [120, 36],
  ])('draws the plan and its buttons inside a %ix%i terminal', (w, h) => {
    const s = { ...createWorkspace('models'), setupComplete: true, overlay: 'engine-panel' as const }
    s.enginePanel = panel()
    const frame = workspaceFrame(s, w, h, 0)
    const approve = frame.targets.find((t) => t.id === 'engine-approve')
    expect(approve).toBeDefined()
    for (const t of frame.targets) expect(t.x + t.width).toBeLessThanOrEqual(w)
    expect(frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')).toContain('vLLM')
  })
})
