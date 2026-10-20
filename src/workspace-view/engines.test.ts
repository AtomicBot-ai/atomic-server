import { describe, expect, it } from 'vitest'
import type { ManagedPhase } from '@atomic-chat/core/contracts'
import type { ManagedEngineState } from '../contract/index.js'
import { DIGEST_A, installation, operation, plan } from '../../test/helpers/managed-fixtures.js'
import {
  engineView,
  formatSize,
  operationView,
  PHASE_LABELS,
  phaseText,
  planLines,
  rebootLines,
  reloginLines,
  removalLines,
  verdictLine,
} from './engines.js'

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
const blocked = plan('vllm', {
  availability: 'prerequisite-blocked',
  blockers: [{ code: 'MANAGED_PREREQUISITE_BLOCKED', message: 'No driver.', commands: ['fix it'] }],
})

describe('engineView', () => {
  it.each([
    ['checking', state({ plan: null })],
    ['unsupported', state({ plan: plan('vllm', { availability: 'unsupported' }) })],
    ['blocked', state({ plan: blocked })],
    ['installable', state()],
    ['operation', state({ operation: operation('vllm', 'pulling-image') })],
    ['consent', state({ operation: operation('vllm', 'awaiting-consent') })],
    [
      'host-step',
      state({
        operation: operation('vllm', 'preparing-host', { pending_host_step: { step_id: 's' } as never }),
      }),
    ],
    ['relogin', state({ operation: operation('vllm', 'relogin-required') })],
    ['reboot', state({ operation: operation('vllm', 'reboot-required') })],
    [
      'failed',
      state({ failed: operation('vllm', 'failed', { error: { code: 'INTERNAL', message: 'boom' } }) }),
    ],
    ['ready', state({ installation: installation('vllm') })],
    [
      'update',
      state({
        installation: installation('vllm'),
        update: { needed: true, target: { version: 'vllm-2', variant: 'linux/amd64' }, apply: 'reinstall' },
      }),
    ],
  ] as const)('%s', (kind, s) => {
    expect(engineView(s).kind).toBe(kind)
  })

  it('puts a running operation above the installation, and the installation above a failure', () => {
    const op = operation('vllm', 'pulling-image')
    expect(engineView(state({ installation: installation('vllm'), operation: op })).kind).toBe('operation')
    expect(engineView(state({ installation: installation('vllm'), failed: op })).kind).toBe('ready')
  })
})

describe('plan and removal lines', () => {
  it('lists everything the consent covers, ending with the digest', () => {
    const lines = planLines(state({ notices: ['NVIDIA terms.'] })).join('\n')
    for (const text of [
      'System changes:',
      'Download: 8.4 GiB',
      'administrator',
      'sign in again',
      'NVIDIA terms.',
    ])
      expect(lines).toContain(text)
    expect(lines.trimEnd().endsWith(`Plan digest: ${DIGEST_A}`)).toBe(true)
  })

  it('says a host with a working container engine needs no system changes', () => {
    const lines = planLines(
      state({
        plan: plan('vllm', { system_changes: [], adopts_existing_engine: true, requires_elevation: false }),
      })
    )
    expect(lines.join('\n')).toContain('No system changes')
    expect(lines.join('\n')).toContain('Needs no administrator rights')
  })

  it('shows a blocked plan as its blockers with their commands, without a digest', () => {
    const lines = planLines(state({ plan: blocked })).join('\n')
    expect(lines).toContain('No driver.')
    expect(lines).toContain('fix it')
    expect(lines).not.toContain('Plan digest')
  })

  it.each([
    [['tensorrt-llm'], undefined, 'kept for tensorrt-llm'],
    [[], true, 'kept as asked'],
    [[], false, 'are removed'],
  ] as const)('removal with %j installed, keep %s: %s', (others, keep, text) => {
    expect(removalLines(state({ models_kept_for: [...others] }), keep).join('\n')).toContain(text)
  })
})

describe('phases', () => {
  it('labels every phase of the core', () => {
    for (const phase of Object.keys(PHASE_LABELS) as ManagedPhase[])
      expect(phaseText(operation('vllm', phase))).toBe(PHASE_LABELS[phase])
  })

  it('counts bytes only for a byte progress, and says when a cancel is pending', () => {
    const pulling = operation('vllm', 'pulling-image', {
      progress: { label: 'image', completed: 5, total: 10, unit: 'bytes' },
      cancellation_requested: true,
    })
    expect(operationView(pulling)).toMatchObject({
      done: 5,
      total: 10,
      text: 'vllm setup: Downloading the engine image (cancelling)',
    })
    const steps = operation('vllm', 'verifying', {
      progress: { label: 'x', completed: 1, total: 2, unit: 'steps' },
    })
    expect(operationView(steps)).toMatchObject({ done: null, total: null })
  })

  it('formats sizes in binary units', () => {
    expect([formatSize(0), formatSize(1536), formatSize(9e9), formatSize(null)]).toEqual([
      '0 B',
      '1.5 KiB',
      '8.4 GiB',
      'unknown',
    ])
  })
})

describe('sign-in and restart instructions', () => {
  it.each([
    ['terminal', ['sign out', 'atc restart']],
    ['systemd-user', ['systemd --user', 'end all your sessions', 'systemctl --user start atc']],
    ['systemd-system', ['system service', 'sudo systemctl restart atc']],
    ['launchd', ['Sign out and in again', 'atc restart']],
  ] as const)('a server run as %s', (launch, texts) => {
    const lines = reloginLines(launch, 'op-1').join('\n')
    for (const text of texts) expect(lines).toContain(text)
    expect(lines).toContain('atc engines install --resume op-1')
    expect(lines).not.toMatch(/reboot|restart the machine now/i)
  })

  it('says a restart of Windows is needed and that the next start continues', () => {
    const lines = rebootLines('op-2').join('\n')
    expect(lines).toContain('restart')
    expect(lines).toContain('atc start')
    expect(lines).toContain('op-2')
  })
})

describe('verdictLine', () => {
  const compatibility = (ok: boolean) => ({
    architectures: ['Qwen3ForCausalLM'],
    quantization_format: 'fp8',
    weight_bytes: 8 * 1024 ** 3,
    checked_gpu_id: 'GPU-0',
    curated: true,
    unified_memory: false,
    fits_other_gpus: ['GPU-1'],
    verdict: ok
      ? ({ ok: true } as const)
      : ({ ok: false, error: { code: 'MODEL_INCOMPATIBLE', message: 'Needs 12.4 GiB, has 7.8.' } } as const),
    warnings: [{ code: 'wsl-vm-memory', message: 'The WSL VM has less memory than the weights.' }],
  })
  it.each([
    [
      true,
      true,
      'vllm (installed): ok — Qwen3ForCausalLM, fp8, 8.0 GiB on GPU-0 (curated); fits GPU-1; warning: The WSL VM',
    ],
    [false, false, 'vllm: refused — Needs 12.4 GiB, has 7.8. (on GPU-0) [MODEL_INCOMPATIBLE]; fits GPU-1'],
  ])('ok %s, installed %s', (ok, installed, line) => {
    expect(
      verdictLine({ engine: 'vllm', installed, compatibility: compatibility(ok) as never, error: null })
    ).toContain(line)
  })
  it('gives a refusal the core’s numbers and the card it checked, as the core sends them in details', () => {
    const refused = {
      ...compatibility(false),
      fits_other_gpus: [],
      verdict: {
        ok: false,
        error: {
          code: 'MODEL_INCOMPATIBLE',
          message: 'Format NVFP4 requires compute capability 10.0 or newer.',
          details: 'required=10.0 actual=8.9',
        },
      },
    }
    const line = verdictLine({
      engine: 'tensorrt-llm',
      installed: true,
      compatibility: refused as never,
      error: null,
    })
    expect(line).toContain('requires compute capability 10.0')
    expect(line).toContain('actual=8.9')
    expect(line).toContain('GPU-0')
  })

  it('says why there is no verdict', () => {
    expect(
      verdictLine({
        engine: 'sglang',
        installed: false,
        compatibility: null,
        error: { code: 'MANAGED_METADATA_INVALID', message: 'No descriptor.' },
      })
    ).toBe('sglang: no verdict — No descriptor. [MANAGED_METADATA_INVALID]')
  })
})
