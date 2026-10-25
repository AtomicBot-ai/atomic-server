import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dataLayout } from '@atomic-chat/core/host'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

const VARIANT = 'gemma-4-e2b-it-openvino-npu'
/** A server with one Foundry Local variant downloaded (`model.yml` and 1000 bytes of weights). */
function context() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'foundry-local' }] }
  const dir = join(tmp.paths.dataFolder, 'foundry-local', 'models', VARIANT)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'model.onnx'), Buffer.alloc(1000))
  const yml = JSON.stringify({
    model_path: `foundry-local/models/${VARIANT}`,
    name: 'Gemma 4 E2B (OpenVINO NPU)',
    foundry_local: {
      model_id: 'gemma-4-e2b-it',
      variant_id: VARIANT,
      execution_provider: 'openvino',
      device: 'npu',
      asset_id: 'azureml://x',
      asset_version: '3',
    },
  })
  writeFileSync(join(dir, 'model.yml'), yml)
  const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
  return { link, dir, service, size: 1000 + yml.length }
}

describe('Foundry Local models in the workspace', () => {
  it('lists a downloaded variant with its device, accelerator and size', async () => {
    const { service, size } = context()
    const rows = (await service.execute('models.installed')) as Array<Record<string, unknown>>
    expect(rows.filter((r) => r['provider'] === 'foundry-local')).toEqual([
      {
        id: VARIANT,
        name: 'Gemma 4 E2B (OpenVINO NPU)',
        provider: 'foundry-local',
        providers: ['foundry-local'],
        store: 'foundry-local',
        model: 'gemma-4-e2b-it',
        device: 'npu',
        execution_provider: 'openvino',
        size_bytes: size,
      },
    ])
  })

  it('unloads a loaded variant, then deletes its folder without the managed store route', async () => {
    const { service, link, dir, size } = context()
    link.snapshotValue.sessions = [{ provider: 'foundry-local', model_id: VARIANT, port: 0 } as never]
    expect(await service.execute('models.remove', { model_id: VARIANT })).toEqual({
      removed: true,
      model_id: VARIANT,
      was_loaded: true,
      freed_bytes: size,
    })
    expect(link.calls.map((c) => c.path)).toContain(`/models/foundry-local/${VARIANT}/unload`)
    expect(link.calls.some((c) => c.path.startsWith('/managed-models'))).toBe(false)
    expect(existsSync(dir)).toBe(false)
  })
})

describe('foundryTakesTools', () => {
  it('reads tools from a variant’s model.yml, and is false for a variant without it', async () => {
    const { service: _s, dir } = context()
    const { foundryTakesTools } = await import('./foundry-store.js')
    const layout = dataLayout(dirname(dirname(dirname(dir))))
    expect(await foundryTakesTools(layout, VARIANT)).toBe(false)
    const yml = JSON.parse(readFileSync(join(dir, 'model.yml'), 'utf8')) as {
      foundry_local: Record<string, unknown>
    }
    yml.foundry_local['tools'] = true
    writeFileSync(join(dir, 'model.yml'), JSON.stringify(yml))
    expect(await foundryTakesTools(layout, VARIANT)).toBe(true)
  })
})
