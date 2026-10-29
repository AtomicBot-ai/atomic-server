import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { HostServices } from '../host/index.js'
import { createLogger } from '../output/index.js'
import { restrictDataFolder } from './restrict-data.js'

describe('restrictDataFolder', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('rejects when Windows ACL grants fail', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atc-acl-'))
    dirs.push(dir)
    const host = {
      facts: { platform: 'win32', username: 'alice' },
      exec: async () => ({ code: 1, stdout: '', stderr: 'Access is denied.', timedOut: false }),
    } as unknown as HostServices
    await expect(
      restrictDataFolder(
        dir,
        host,
        { USERDOMAIN: 'HOST' },
        createLogger(() => undefined, { level: 'error' })
      )
    ).rejects.toMatchObject({
      code: 'ATC_DAEMON_START_FAILED',
      message: 'Could not restrict the data folder to this user.',
      details: 'Access is denied.',
    })
  })
})
