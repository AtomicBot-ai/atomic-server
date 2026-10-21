import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AtomicCoreError } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../config/index.js'
import { WorkspaceService } from './index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

/** A server with one GGUF model, one MLX model and one Foundry Local variant on disk. */
function context(registered: string[]) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const model = (dir: string, yml: object) => {
    mkdirSync(join(tmp.paths.dataFolder, dir), { recursive: true })
    writeFileSync(join(tmp.paths.dataFolder, dir, 'model.yml'), JSON.stringify(yml))
  }
  model('llamacpp/models/qwen3-8b', { model_path: 'llamacpp/models/qwen3-8b/m.gguf', name: 'Qwen3 8B' })
  model('mlx/models/gemma-mlx', { model_path: 'mlx/models/gemma-mlx', name: 'Gemma MLX' })
  model('foundry-local/models/phi-cpu', {
    model_path: 'foundry-local/models/phi-cpu',
    name: 'Phi (CPU)',
    foundry_local: { model_id: 'phi', variant_id: 'phi-cpu', execution_provider: 'cpu', device: 'cpu' },
  })
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: registered.map((engine) => ({ engine })) }
  const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
  const providers = async () =>
    Object.fromEntries(
      ((await service.execute('models.installed')) as Array<{ id: string; providers: string[] }>).map((m) => [
        m.id,
        m.providers,
      ])
    )
  return { link, providers }
}

describe('models.installed providers', () => {
  it('gives each model every registered provider that reads its folder and lists it', async () => {
    const { providers } = context(['llamacpp-upstream', 'llamacpp', 'mlx', 'vllm', 'foundry-local'])
    expect(await providers()).toEqual({
      'qwen3-8b': ['llamacpp-upstream', 'llamacpp'],
      'gemma-mlx': ['mlx'],
      'phi-cpu': ['foundry-local'],
    })
  })

  it('leaves out a provider whose capabilities route does not list the model', async () => {
    const { link, providers } = context(['llamacpp-upstream', 'llamacpp', 'atomic-prism'])
    link.responses['GET /models/atomic-prism/qwen3-8b/capabilities'] = new AtomicCoreError(
      'MODEL_NOT_FOUND',
      'no'
    )
    expect((await providers())['qwen3-8b']).toEqual(['llamacpp-upstream', 'llamacpp'])
  })

  it('leaves out a provider this host does not register', async () => {
    const { providers } = context(['llamacpp-upstream'])
    expect((await providers())['qwen3-8b']).toEqual(['llamacpp-upstream'])
    expect((await providers())['gemma-mlx']).toEqual([])
  })
})

describe('engine order', () => {
  const CORE_ORDER = ['llamacpp-upstream', 'mlx', 'foundry-local', 'tensorrt-llm', 'vllm', 'sglang']

  it('answers engines.list in the order both UIs show: managed as the desktop app, then Foundry Local', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = { engines: CORE_ORDER.map((engine) => ({ engine })) }
    const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
    const listed = (await service.execute('engines.list')) as { engines: Array<{ engine: string }> }
    expect(listed.engines.map((e) => e.engine)).toEqual([
      'llamacpp-upstream',
      'mlx',
      'vllm',
      'sglang',
      'tensorrt-llm',
      'foundry-local',
    ])
  })
})
