import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createLogger, fileSink } from './logger.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

it('recreates the log directory when it is removed while the sink is open', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-log-missing-dir-'))
  dirs.push(dir)
  const path = join(dir, 'logs', 'daemon.log')
  const log = createLogger(fileSink(path, { maxSizeBytes: 1024 * 1024, maxFiles: 2, format: 'text' }), {
    level: 'info',
    scope: 'core',
    now: () => 0,
  })
  log.info('first')
  rmSync(join(dir, 'logs'), { recursive: true, force: true })
  log.info('after removal')
  expect(readFileSync(path, 'utf8')).toBe('1970-01-01T00:00:00.000Z [info] core: after removal\n')
})
