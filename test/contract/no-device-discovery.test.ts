import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ModelRegistry } from '@atomic-chat/core/models'
import { dataLayout } from '@atomic-chat/core/host'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { WORKSPACE_OPERATIONS } from '../../src/contract/index.js'
import { defaultConfig } from '../../src/config/index.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'

it('does not expose automatic discovery or import external files into a clean profile', async () => {
  const temp = tmpDataFolder(),
    home = join(temp.paths.dataFolder, 'home'),
    external = join(home, 'desktop')
  const model = join(home, '.ollama', 'models', 'external.gguf')
  await mkdir(join(home, '.ollama', 'models'), { recursive: true })
  await writeFile(model, 'external weights')
  await new ModelRegistry(dataLayout(external)).write('external', { model_path: model })
  const link = fakeCoreLink()
  const service = new WorkspaceService({
    paths: temp.paths,
    link,
    config: defaultConfig(),
    env: { HOME: home, ATC_DISCOVERY_DATA_FOLDERS: JSON.stringify([external]) },
  })
  try {
    for (const name of [
      'models.discover',
      'models.adopt',
      'models.on-device',
      'models.prepare',
      'engines.discover',
      'engines.adopt',
    ]) {
      expect(WORKSPACE_OPERATIONS.some((op) => op.name === name)).toBe(false)
      await expect(service.execute(name)).rejects.toThrow('Unknown operation')
    }
    expect(await service.execute('models.installed')).toEqual([])
    expect(await new ModelRegistry(temp.paths.layout).list()).toEqual([])
  } finally {
    temp.cleanup()
  }
})
