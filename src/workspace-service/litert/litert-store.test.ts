import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { liteRtStoreModels, removeLiteRtModel } from './litert-store.js'
import { chatAbilities } from '../models/store-variants.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

/** A data folder with one downloaded LiteRT-LM NPU variant and one interrupted download. */
function store(block: Record<string, unknown> = {}) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const root = join(tmp.paths.dataFolder, 'litert-lm', 'models')
  const dir = join(root, 'gemma-4-e4b-npu-lnl')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'gemma.litertlm'), Buffer.alloc(500))
  const yml = JSON.stringify({
    model_path: 'litert-lm/models/gemma-4-e4b-npu-lnl/gemma.litertlm',
    name: 'Gemma 4 E4B (NPU (intel-lnl))',
    litert_lm: {
      model_id: 'gemma-4-e4b',
      variant_id: 'gemma-4-e4b-npu-lnl',
      backend: 'npu',
      npu: 'intel-lnl',
      ...block,
    },
  })
  writeFileSync(join(dir, 'model.yml'), yml)
  mkdirSync(join(root, 'half-downloaded'))
  return { layout: tmp.paths.layout, dir, size: 500 + yml.length }
}

describe('LiteRT-LM store', () => {
  it('lists every folder with model.yml, with its model, backend, NPU and size', async () => {
    const { layout, size } = store()
    expect(await liteRtStoreModels(layout)).toEqual([
      {
        id: 'gemma-4-e4b-npu-lnl',
        name: 'Gemma 4 E4B (NPU (intel-lnl))',
        provider: 'litert-lm',
        providers: ['litert-lm'],
        store: 'litert-lm',
        model: 'gemma-4-e4b',
        backend: 'npu',
        npu: 'intel-lnl',
        size_bytes: size,
      },
    ])
  })

  it('unloads a loaded variant, deletes its folder and says what it freed', async () => {
    const { layout, dir, size } = store()
    const link = fakeCoreLink()
    link.snapshotValue.sessions = [
      { provider: 'litert-lm', model_id: 'gemma-4-e4b-npu-lnl', port: 0 } as never,
    ]
    expect(await removeLiteRtModel(link, layout, 'gemma-4-e4b-npu-lnl')).toEqual({
      removed: true,
      model_id: 'gemma-4-e4b-npu-lnl',
      was_loaded: true,
      freed_bytes: size,
    })
    expect(link.calls.some((c) => c.path === '/models/litert-lm/gemma-4-e4b-npu-lnl/unload')).toBe(true)
    expect(existsSync(dir)).toBe(false)
    expect(await removeLiteRtModel(link, layout, 'not-a-variant')).toBeUndefined()
  })

  it('reads what a variant takes in a chat from its model.yml', async () => {
    const { layout } = store({ tools: true, vision: false })
    expect(await chatAbilities(layout, 'litert-lm', 'gemma-4-e4b-npu-lnl')).toEqual({
      tools: true,
      vision: false,
    })
    expect(await chatAbilities(layout, 'llamacpp', 'gemma-4-e4b-npu-lnl')).toEqual({})
  })
})
