import { afterEach, expect, it } from 'vitest'
import { CORE_VERSION } from '@atomic-chat/core'
import { LOCAL_PROVIDER_IDS, settingsSchema } from '@atomic-chat/core/settings'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { defaultConfig, readTextFile, resolveConfig } from '../config/index.js'
import { engineSettingsSchema, updateWorkspaceConfig } from './settings.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('serves the embedded core descriptors and its CORE_VERSION', () => {
  expect(engineSettingsSchema('atomic-prism')).toEqual({
    provider: 'atomic-prism',
    core_version: CORE_VERSION,
    descriptors: settingsSchema('atomic-prism'),
  })
  const schema = engineSettingsSchema('llamacpp-upstream') as {
    descriptors: Array<{ key: string; controllerType: string }>
  }
  expect(schema.descriptors.find((f) => f.key === 'version_backend')?.controllerType).toBe('dropdown')
  expect(schema.descriptors.some((f) => f.key === 'dflash')).toBe(true)
})
it.each(LOCAL_PROVIDER_IDS)('has a schema for local provider %s', (provider) => {
  expect(engineSettingsSchema(provider).descriptors).toEqual(settingsSchema(provider))
})
it.each(['sd-cpp', 'nope'])('answers ATC_USAGE for %s', (provider) => {
  expect(() => engineSettingsSchema(provider)).toThrow(expect.objectContaining({ code: 'ATC_USAGE' }))
  expect(() => engineSettingsSchema(provider)).toThrow('task configuration')
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
