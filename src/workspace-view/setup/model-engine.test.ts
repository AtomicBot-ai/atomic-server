import { expect, it } from 'vitest'
import { onboardingModelMatchesEngine } from './model-engine.js'

it.each([
  ['fastflowlm|v1|npu', { provider: 'fastflowlm' }, true],
  ['fastflowlm', { provider: 'llamacpp-upstream' }, false],
  ['mlx', { provider: 'mlx' }, true],
  ['llamacpp', { provider: 'llamacpp-upstream', providers: ['llamacpp-upstream', 'llamacpp'] }, true],
  ['atomic-prism', { provider: 'llamacpp-upstream' }, false],
  ['mlx', {}, false],
  ['mlx', { provider: 'mlx', providers: [] }, false],
  ['llamacpp-upstream', { provider: 'llamacpp-upstream', providers: ['atomic-prism'] }, false],
  ['', { provider: 'fastflowlm' }, true],
] as const)('matches %s against core model providers %j', (engine, model, expected) => {
  expect(onboardingModelMatchesEngine(model, engine)).toBe(expected)
})
