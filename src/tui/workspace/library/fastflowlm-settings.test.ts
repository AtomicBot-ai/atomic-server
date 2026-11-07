import { expect, it } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { settingsModel } from './engine-settings-model.js'
import type { EnginePanel } from './engine-panel-model.js'

it('renders all core FLM launch settings and NPU power choices in the TUI', () => {
  const descriptors = settingsSchema('fastflowlm')
  const panel = {
    engine: 'fastflowlm',
    form: { descriptors, values: {}, draft: { pmode: 'balanced', prefix_slots: 0 }, revision: 1, gpus: [] },
    choice: 'pmode',
  } as unknown as EnginePanel
  const result = settingsModel(panel)
  expect(result.fields.filter((f) => f.id.startsWith('engine-setting:')).map((f) => f.id)).toEqual(
    [
      'ctx_len',
      'pmode',
      'prefill_chunk_len',
      'prefix_cache_mb',
      'prefix_slots',
      'prefix_min_gain',
      'timeout',
    ].map((key) => `engine-setting:${key}`)
  )
  expect(result.fields.filter((f) => f.id.startsWith('engine-option:')).map((f) => f.label)).toEqual([
    '  ( ) powersaver',
    '  (o) balanced',
    '  ( ) performance',
    '  ( ) turbo',
  ])
  expect(result.buttons).toContainEqual(expect.objectContaining({ id: 'engine-settings-save' }))
})
