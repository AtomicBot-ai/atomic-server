import { afterEach, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { defaultConfig, readTextFile, resolveConfig } from '../config/index.js'
import { engineSettingsSchema, updateWorkspaceConfig } from './settings.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('uses published engine descriptors including dropdowns and native defaults', () => {
  const schema = engineSettingsSchema('llamacpp-upstream') as {
    descriptors: Array<{ key: string; controllerType: string }>
  }
  expect(schema.descriptors.find((f) => f.key === 'version_backend')?.controllerType).toBe('dropdown')
  expect(schema.descriptors.some((f) => f.key === 'dflash')).toBe(true)
  expect(() => engineSettingsSchema('sd-cpp')).toThrow('task configuration')
})
it('validates and persists server settings and rejects unsupported CORS controls', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const config = defaultConfig()
  await expect(updateWorkspaceConfig(tmp.paths, config, { 'api.port': 99999 })).rejects.toThrow()
  await expect(updateWorkspaceConfig(tmp.paths, config, { 'api.cors': false })).rejects.toThrow('Unsupported')
  expect(await updateWorkspaceConfig(tmp.paths, config, { 'api.port': 15550 })).toMatchObject({
    restart_required: true,
  })
  expect(resolveConfig({ fileText: await readTextFile(tmp.paths.configFile), env: {} }).values.api.port).toBe(
    15550
  )
})
