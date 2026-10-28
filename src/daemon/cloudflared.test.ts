import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeHost } from '../../test/helpers/test-context.js'
import { recordingIo } from '../io.js'
import { createLogger } from '../output/index.js'
import { serverCloudflared } from './cloudflared.js'

const folders: string[] = []
afterEach(() => folders.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function linuxServer(env: NodeJS.ProcessEnv, files: Record<string, string> = {}) {
  const host = fakeHost()
  host.facts = { ...host.facts, platform: 'linux', homedir: '/nonexistent-home' }
  const io = recordingIo({ env })
  io.readFile = async (path) => files[path]
  return { io, host, log: createLogger(() => {}, { level: 'silent' }) }
}

describe.skipIf(process.platform === 'win32')(
  'serverCloudflared: what the server tells the core and its clients about cloudflared',
  () => {
    it('finds one on PATH and hands its path over', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'atc-cloudflared-'))
      folders.push(dir)
      writeFileSync(join(dir, 'cloudflared'), '#!/bin/sh\n')
      chmodSync(join(dir, 'cloudflared'), 0o755)
      const found = await serverCloudflared(linuxServer({ PATH: dir }))
      expect(found.path).toBe(join(dir, 'cloudflared'))
      expect(found.setup.found).toBe(join(dir, 'cloudflared'))
    })

    it('gives the commands for the Linux /etc/os-release names', async () => {
      const env = { PATH: '', ATOMIC_CLOUDFLARED_BIN: '/nonexistent/cloudflared' }
      const found = await serverCloudflared(linuxServer(env, { '/etc/os-release': 'ID=arch\n' }))
      expect(found.path).toBeUndefined()
      expect(found.setup).toMatchObject({ found: null, commands: ['sudo pacman -S cloudflared'] })
    })
  }
)
