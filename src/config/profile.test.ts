import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { initializeProfileDefaults, loadProfileConfig } from './profile.js'
import { setConfigValue } from './edit.js'

it('keeps a fresh detached profile on 1339 across concurrent starts, reads and restarts', async (t) => {
  const { paths, cleanup } = tmpDataFolder()
  t.onTestFinished(cleanup)
  mkdirSync(paths.logsDir, { recursive: true })
  writeFileSync(paths.daemonOutLog, '')
  expect((await loadProfileConfig(paths, {})).values.api.port).toBe(1339)
  expect(existsSync(paths.configFile)).toBe(false)
  await Promise.all([initializeProfileDefaults(paths), initializeProfileDefaults(paths)])
  writeFileSync(paths.daemonLog, 'ready')
  await initializeProfileDefaults(paths)
  expect((await loadProfileConfig(paths, {})).values.api.port).toBe(1339)
})

it.each(['keyring', 'log'])(
  'preserves the implicit port of a profile with only its old %s',
  async (artifact) => {
    const { paths, cleanup } = tmpDataFolder()
    try {
      mkdirSync(paths.logsDir, { recursive: true })
      writeFileSync(artifact === 'log' ? paths.daemonLog : join(paths.atcDir, 'client-keys.json'), '')
      await initializeProfileDefaults(paths)
      expect((await loadProfileConfig(paths, {})).sources['api.port']).toBe('default')
      const current = await loadProfileConfig(paths, { ATC_API_PORT: '8000' })
      expect(current.values.api.port).toBe(8000)
      await setConfigValue(paths.configFile, current, 'log.level', 'warn')
      const saved = await loadProfileConfig(paths, {})
      expect(saved.values.api.port).toBe(1337)
      expect(saved.values.admin.port).toBe(1338)
    } finally {
      cleanup()
    }
  }
)
