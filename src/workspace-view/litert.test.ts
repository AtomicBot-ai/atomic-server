import { describe, expect, it } from 'vitest'
import { liteRtVariantLabel, liteRtVerdictText } from './litert.js'

describe('LiteRT-LM view', () => {
  it.each([
    [{ backend: 'gpu' }, 'GPU'],
    [{ backend: 'npu', npu: 'intel-lnl' }, 'NPU (intel-lnl)'],
  ])('labels %o as %s', (v, label) => expect(liteRtVariantLabel(v)).toBe(label))

  it.each([
    [{ verdict: 'ok', reason: null }, 'ok'],
    [{ verdict: 'engine-not-installed', reason: null }, 'engine-not-installed (atc engines install litert-lm)'],
    [
      { verdict: 'accelerator-not-prepared', reason: 'openvino' },
      'accelerator-not-prepared — openvino (atc engines accelerators litert-lm --prepare)',
    ],
    [{ verdict: 'platform-unsupported', reason: 'no NPU' }, 'platform-unsupported — no NPU'],
  ])('says %o as %s', (v, text) => expect(liteRtVerdictText(v)).toBe(text))
})
