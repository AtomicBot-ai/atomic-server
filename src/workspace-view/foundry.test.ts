import { describe, expect, it } from 'vitest'
import type { FoundryAcceleratorsView } from '../contract/index.js'
import { acceleratorLines, foundryVerdictText, prepareResultLines, variantLabel } from './foundry.js'

const view = (over: Partial<FoundryAcceleratorsView> = {}): FoundryAcceleratorsView => ({
  installed: true,
  build: 'v2.1.0/win-x64',
  version: '2.1.0',
  c_api_version: 2,
  probed_at: 1,
  accelerators: [
    { name: 'OpenVINOExecutionProvider', execution_provider: 'openvino', device: 'npu', prepared: true },
    { name: 'CUDAExecutionProvider', execution_provider: 'cuda', device: 'gpu', prepared: false },
    { name: 'MysteryProvider', execution_provider: null, device: 'gpu', prepared: false, reason: 'unknown' },
  ] as never,
  error: null,
  preparing: false,
  last_result: null,
  last_error: null,
  steps: [],
  ...over,
})

describe('variantLabel', () => {
  it.each([
    [{ execution_provider: 'openvino', device: 'npu' }, 'OpenVINO NPU'],
    [{ execution_provider: 'openvino', device: 'gpu' }, 'OpenVINO GPU'],
    [{ execution_provider: 'cuda', device: 'gpu' }, 'CUDA'],
    [{ execution_provider: 'qnn', device: 'npu' }, 'QNN NPU'],
    [{ execution_provider: 'cpu', device: 'cpu' }, 'CPU'],
  ])('%j', (v, label) => expect(variantLabel(v)).toBe(label))
})

describe('acceleratorLines', () => {
  it('says which are prepared, which can be, and that one without an execution provider is not offered', () => {
    expect(acceleratorLines(view())).toEqual([
      'OpenVINO NPU: prepared',
      'CUDA GPU: not prepared — atc engines accelerators foundry-local --prepare',
      'MysteryProvider: not offered (unknown)',
    ])
  })

  it('says a prepare is running, and why the last one failed', () => {
    const lines = acceleratorLines(view({ preparing: true, last_error: 'disk full' }))
    expect(lines).toContain('Preparing accelerators in the server…')
    expect(lines).toContain('The last prepare failed: disk full')
  })

  it('shows each accelerator’s step while a prepare runs', () => {
    const lines = acceleratorLines(
      view({
        preparing: true,
        steps: [
          { accelerator: 'CUDAExecutionProvider', stage: 'downloading', fraction: 0.4 },
          { accelerator: 'QNNExecutionProvider', stage: 'failed', fraction: null, reason: 'no driver' },
        ] as never,
      })
    )
    expect(lines).toContain('CUDAExecutionProvider: downloading 40%')
    expect(lines).toContain('QNNExecutionProvider: failed — no driver')
  })

  it('says the engine is not installed, and why the probe failed', () => {
    expect(acceleratorLines(view({ installed: false, accelerators: [] }))).toEqual([
      'Foundry Local is not installed: atc engines install foundry-local',
    ])
    expect(acceleratorLines(view({ accelerators: [], error: 'the library does not load' }))).toEqual([
      'The library was not probed: the library does not load',
    ])
  })

  it('says a CPU-only host needs nothing prepared', () => {
    expect(
      acceleratorLines(
        view({
          accelerators: [
            { name: 'CPUExecutionProvider', execution_provider: 'cpu', device: 'cpu', prepared: true },
          ] as never,
        })
      )
    ).toEqual(['CPU: prepared', 'Models run on the CPU; nothing needs preparing.'])
  })
})

describe('prepareResultLines', () => {
  it('lists each accelerator with its result', () => {
    expect(
      prepareResultLines({
        accelerators: [
          { name: 'CUDAExecutionProvider', prepared: true },
          { name: 'QNNExecutionProvider', prepared: false, reason: 'no NPU driver' },
        ],
      })
    ).toEqual(['CUDAExecutionProvider: prepared', 'QNNExecutionProvider: not prepared — no NPU driver'])
  })
})

describe('foundryVerdictText', () => {
  it.each([
    [{ verdict: 'ok', reason: null }, 'ok'],
    [
      { verdict: 'accelerator-not-prepared', reason: 'CUDA' },
      'accelerator-not-prepared — CUDA (atc engines accelerators foundry-local --prepare)',
    ],
    [
      { verdict: 'engine-not-installed', reason: null },
      'engine-not-installed (atc engines install foundry-local)',
    ],
    [{ verdict: 'platform-unsupported', reason: 'not here' }, 'platform-unsupported — not here'],
  ])('%j', (v, text) => expect(foundryVerdictText(v)).toBe(text))
})
