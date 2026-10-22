import { describe, expect, it } from 'vitest'
import { classifyLiteRtFile, hfVariants } from './litert-hf.js'

describe('classifyLiteRtFile', () => {
  it.each([
    ['gemma-4-E2B-it.litertlm', { kind: 'plain', stem: 'gemma-4-E2B-it' }],
    ['gemma-4-E2B-it-gpu.litertlm', { kind: 'variant', stem: 'gemma-4-E2B-it', backend: 'gpu' }],
    ['qwen3_4b_mixed_int4_gpu.litertlm', { kind: 'variant', stem: 'qwen3_4b_mixed_int4', backend: 'gpu' }],
    [
      'gemma-4-E2B-it_intel_LNL.litertlm',
      { kind: 'variant', stem: 'gemma-4-E2B-it', backend: 'npu', npu: 'intel-lnl' },
    ],
    [
      'gemma-4-E2B-it_intel_PTL.litertlm',
      { kind: 'variant', stem: 'gemma-4-E2B-it', backend: 'npu', npu: 'intel-ptl' },
    ],
    ['sub/dir/model.litertlm', { kind: 'plain', stem: 'model' }],
  ])('%s', (path, expected) => expect(classifyLiteRtFile(path)).toEqual(expected))

  it.each([
    'gemma-4-E2B-it-web.litertlm',
    'gemma-4-E2B-it_web.litertlm',
    'gemma-4-E2B-it_Google_Tensor_G5.litertlm',
    'gemma-4-E2B-it_sm8750.litertlm',
    'gemma-4-E2B-it_SM8650.litertlm',
    'gemma-4-E2B-it_mt6993.litertlm',
    'gemma-4-E2B-it_qualcomm_sm8750.litertlm',
    'gemma-4-E2B-it_intel_NVL.litertlm',
    'gemma-4-E2B-it.task',
    'README.md',
  ])('offers nothing for %s', (path) => expect(classifyLiteRtFile(path)).toBeNull())
})

describe('hfVariants', () => {
  const file = (path: string) => ({ path, size: 100, sha256: 'a'.repeat(64) })
  const spec = [
    'gemma-4-E2B-it.litertlm',
    'gemma-4-E2B-it-gpu.litertlm',
    'gemma-4-E2B-it-web.litertlm',
    'gemma-4-E2B-it_intel_LNL.litertlm',
    'gemma-4-E2B-it_Google_Tensor_G5.litertlm',
  ].map(file)

  it('builds cpu, gpu and npu (intel-lnl) from the spec’s repository, no web or Tensor file', () => {
    expect(
      hfVariants(spec, ['cpu', 'gpu', 'npu']).map((v) => [v.id, v.backend, v.npu ?? null, v.file.path])
    ).toEqual([
      ['gemma-4-e2b-it-npu-intel-lnl', 'npu', 'intel-lnl', 'gemma-4-E2B-it_intel_LNL.litertlm'],
      ['gemma-4-e2b-it-gpu', 'gpu', null, 'gemma-4-E2B-it-gpu.litertlm'],
      ['gemma-4-e2b-it-cpu', 'cpu', null, 'gemma-4-E2B-it.litertlm'],
    ])
  })

  it('offers the plain file for the GPU too when the repository has no GPU file', () => {
    expect(
      hfVariants([file('gemma-4-E2B-it.litertlm')], ['cpu', 'gpu']).map((v) => [v.id, v.file.path])
    ).toEqual([
      ['gemma-4-e2b-it-gpu', 'gemma-4-E2B-it.litertlm'],
      ['gemma-4-e2b-it-cpu', 'gemma-4-E2B-it.litertlm'],
    ])
  })

  it('offers only the backends conf allows on this platform', () => {
    expect(hfVariants(spec, ['cpu', 'npu']).map((v) => v.backend)).toEqual(['npu', 'cpu'])
  })

  it('keeps each quantisation of a repository as its own variant', () => {
    const qwen = ['qwen3_4b_mixed_int4.litertlm', 'qwen3_4b_channelwise_int8_float32kv.litertlm'].map(file)
    expect(hfVariants(qwen, ['cpu']).map((v) => v.id)).toEqual([
      'qwen3_4b_mixed_int4-cpu',
      'qwen3_4b_channelwise_int8_float32kv-cpu',
    ])
  })

  it('skips a file without an LFS sha256', () => {
    expect(hfVariants([{ path: 'm.litertlm', size: 10, sha256: null }], ['cpu'])).toEqual([])
  })
})
