import { describe, expect, it } from 'vitest'
import type { DataFolderEnv } from '@atomic-chat/core/host'
import { resolveAtcPaths } from './paths.js'

const linux = (env: NodeJS.ProcessEnv = {}): DataFolderEnv => ({
  platform: 'linux',
  env,
  homedir: '/home/u',
  exists: () => false,
  readFile: () => undefined,
})

describe('resolveAtcPaths', () => {
  it('defaults to the core CLI folder and derives the atc files', () => {
    const paths = resolveAtcPaths(linux())
    expect(paths.dataFolder).toBe('/home/u/.local/share/atomic-chat-cli/data')
    expect(paths.configFile).toBe('/home/u/.local/share/atomic-chat-cli/data/atc/config.json')
    expect(paths.daemonRecord).toBe('/home/u/.local/share/atomic-chat-cli/data/atc/run/daemon.json')
    expect(paths.engineLog).toBe('/home/u/.local/share/atomic-chat-cli/data/atc/logs/engines.log')
    // The core's layout joins with the host's separator; only its shape is asserted here.
    expect(paths.layout.core.instanceLock).toMatch(/atomic-core[\\/]instance\.lock$/)
  })

  it('uses Windows path rules for a Windows environment', () => {
    const paths = resolveAtcPaths({
      ...linux(),
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
      homedir: 'C:\\Users\\u',
    })
    expect(paths.dataFolder).toBe('C:\\Users\\u\\AppData\\Roaming\\atomic-chat-cli\\data')
    expect(paths.configFile).toBe('C:\\Users\\u\\AppData\\Roaming\\atomic-chat-cli\\data\\atc\\config.json')
  })

  it('prefers the flag over the environment', () => {
    expect(resolveAtcPaths(linux({ ATC_DATA_FOLDER: '/from-env' })).dataFolder).toBe('/from-env')
    expect(resolveAtcPaths(linux({ ATC_DATA_FOLDER: '/from-env' }), '/from-flag').dataFolder).toBe(
      '/from-flag'
    )
  })

  it("refuses the desktop app's folder", () => {
    expect(() => resolveAtcPaths(linux(), '/home/u/.local/share/Atomic Chat/data')).toThrow(
      /application data folder/
    )
  })
})
