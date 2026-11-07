import { expect, it } from 'vitest'
import { setupEngineChoice } from './setup-engine-choice.js'

it.each([
  ['fastflowlm|v1|npu', 'fastflowlm'],
  ['mlx|v2|arm64', 'mlx'],
  ['vllm|v1|linux', 'vllm'],
  ['llamacpp-upstream|b1|cpu', 'llamacpp-upstream|b1|cpu'],
  ['', ''],
])('routes stored choice %s as %s', (choice, expected) => {
  expect(setupEngineChoice(choice, [])).toBe(expected)
})
