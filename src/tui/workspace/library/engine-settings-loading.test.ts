import { expect, it, vi } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { createWorkspace } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { engineAction } from './engine-actions.js'
import { enginePanelModel } from './engine-panel-model.js'
import { drawEnginePanel } from './engine-panel.js'
import { canvas } from '../draw/canvas.js'

it.each([
  ['fastflowlm', 'fastflowlm.probe'],
  ['llamacpp-upstream', 'engines.list'],
])('opens and saves %s settings while %s is still pending', async (engine, blocked) => {
  let s = createWorkspace('models')
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const descriptors = settingsSchema(engine as Parameters<typeof settingsSchema>[0])
  const key = engine === 'fastflowlm' ? 'ctx_len' : 'fit_ctx'
  const execute = vi.fn(async (name: string) => {
    if (name === blocked) await wait
    if (name === 'settings.schema') return { descriptors }
    if (name === 'settings.get') return { revision: 4, values: {} }
    return []
  })
  const ctx: Pick<ActionContext, 'get' | 'update' | 'controller'> = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: {
      runtime: { execute, start: async () => ({ launch: 'terminal' }) },
    } as unknown as WorkspaceController,
  }
  const opening = engineAction(`engine-open:${engine}`, ctx)
  try {
    await vi.waitFor(() => expect(s.enginePanel?.form?.descriptors).toEqual(descriptors), { timeout: 150 })
    const c = canvas(120, 30)
    drawEnginePanel(c, s, `engine-setting:${key}`)
    expect(c.targets.some((t) => t.id === `engine-setting:${key}`)).toBe(true)
    await engineAction(`engine-setting:${key}`, ctx)
    expect(s.edit).toBe(`engine-setting:${key}`)
    s = { ...s, editValue: '8192' }
    await engineAction('engine-setting-commit', ctx)
    expect(enginePanelModel(s.enginePanel!, null).buttons.some((b) => b.id === 'engine-settings-save')).toBe(
      true
    )
    await engineAction('engine-settings-save', ctx)
    expect(execute).toHaveBeenCalledWith('settings.update', {
      provider: engine,
      values: { [key]: 8192 },
      expected_revision: 4,
    })
  } finally {
    release()
    await opening
  }
})
