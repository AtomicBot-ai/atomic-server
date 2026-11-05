import { mkdir, writeFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { runAtcAsync } from '../helpers/async-binary.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it.each([false, true])(
  'keeps the API default across a detached restart (previous server: %s)',
  async (legacy) => {
    const { paths, cleanup } = tmpDataFolder()
    const command = (...args: string[]) =>
      runAtcAsync([...args, '--data-folder', paths.dataFolder], {
        env: { ...process.env, ATC_API_PORT: undefined, ATC_ADMIN_PORT: '0', ATC_API_AUTO_START: 'false' },
      })
    try {
      if (legacy) {
        await mkdir(paths.logsDir, { recursive: true })
        await writeFile(paths.daemonLog, 'previous server\n')
      }
      for (const action of ['start', 'restart']) {
        const start = await command(action)
        expect(start.code, start.err).toBe(0)
        const info = await command('control', 'call', 'connection.info', '--json')
        expect(info.code, info.err).toBe(0)
        expect(JSON.parse(info.out).result.port).toBe(legacy ? 1337 : 1339)
      }
    } finally {
      await command('stop', '--force', '--kill')
      cleanup()
    }
  }
)
