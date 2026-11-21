import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../config/index.js'
import { createLogger } from '../output/index.js'
import { spawnDaemon } from './spawn.js'

const created: string[] = []
afterEach(() => {
  created.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

function freshPaths() {
  const folder = mkdtempSync(join(tmpdir(), 'atc-spawn-log-'))
  created.push(folder)
  return atcPathsFor(folder)
}

const silent = () => createLogger(() => {}, { level: 'silent' })

describe('spawnDaemon when the log file cannot be prepared', () => {
  it('reports a typed start failure for the log folder and the log file', async () => {
    const folderIsFile = freshPaths()
    mkdirSync(folderIsFile.atcDir, { recursive: true })
    writeFileSync(folderIsFile.logsDir, 'not a folder')
    await expect(
      spawnDaemon({
        paths: folderIsFile,
        selfCommand: [process.execPath, '-e', 'process.exit(0)'],
        log: silent(),
      })
    ).rejects.toMatchObject({
      code: 'ATC_DAEMON_START_FAILED',
      details: expect.stringContaining(folderIsFile.logsDir),
    })

    const fileIsFolder = freshPaths()
    mkdirSync(fileIsFolder.daemonOutLog, { recursive: true })
    await expect(
      spawnDaemon({
        paths: fileIsFolder,
        selfCommand: [process.execPath, '-e', 'process.exit(0)'],
        log: silent(),
      })
    ).rejects.toMatchObject({
      code: 'ATC_DAEMON_START_FAILED',
      details: expect.stringContaining(fileIsFolder.daemonOutLog),
    })
  })
})
