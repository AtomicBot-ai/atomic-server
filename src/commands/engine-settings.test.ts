import { describe, expect, it } from 'vitest'
import { engineKey } from './engine-settings.js'

describe('engineKey', () => {
  it.each([
    ['engine.tensorrt-llm.context_length', { provider: 'tensorrt-llm', key: 'context_length' }],
    ['engine.llamacpp.version_backend', { provider: 'llamacpp', key: 'version_backend' }],
    ['engine.vllm', undefined],
    ['engines.default', undefined],
    ['engine..x', undefined],
  ])('%s', (raw, parsed) => expect(engineKey(raw)).toEqual(parsed))
})
