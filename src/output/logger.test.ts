import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { recordingIo } from '../io.js'
import { colorsFor } from './color.js'
import { createLogger, fileSink, formatEntry, levelFromFlags, stderrSink } from './logger.js'
import type { LogEntry } from './logger.js'

describe('logger', () => {
  it('filters by level and scopes children', () => {
    const seen: LogEntry[] = []
    const log = createLogger((e) => seen.push(e), { level: 'info', now: () => 1 })
    log.debug('no')
    log.info('yes')
    log.child('admin').warn('scoped', { port: 1 })
    expect(seen.map((e) => [e.level, e.scope, e.message])).toEqual([
      ['info', undefined, 'yes'],
      ['warn', 'admin', 'scoped'],
    ])
    expect(formatEntry(seen[1]!, colorsFor(false))).toBe('[warn] admin: scoped {"port":1}')
  })

  it('maps flags to levels', () => {
    expect(levelFromFlags({ verbose: true, quiet: false })).toBe('debug')
    expect(levelFromFlags({ verbose: true, quiet: true })).toBe('error')
    expect(levelFromFlags({ verbose: false, quiet: false })).toBe('info')
  })

  it('writes JSON lines to stderr in json mode', () => {
    const io = recordingIo()
    createLogger(stderrSink(io, { json: true, colors: colorsFor(false) }), {
      level: 'info',
      now: () => 0,
    }).info('x', { a: 1 })
    expect(JSON.parse(io.err[0]!)).toMatchObject({ level: 'info', message: 'x', a: 1 })
  })

  describe('fileSink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atc-log-'))
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    const write = (path: string, options: Parameters<typeof fileSink>[1], lines: string[]) => {
      const log = createLogger(fileSink(path, options), { level: 'debug', now: () => 0 })
      for (const line of lines) log.info(line)
    }

    it.each([
      [1, ['d.log']],
      [2, ['d.log', 'd.log.1']],
      [3, ['d.log', 'd.log.1', 'd.log.2']],
    ])('keeps exactly %i file(s) after many rotations', (maxFiles, expected) => {
      const path = join(dir, 'd.log')
      write(
        path,
        { maxSizeBytes: 200, maxFiles },
        Array.from({ length: 40 }, (_, i) => `line ${i} ${'x'.repeat(30)}`)
      )
      expect(readdirSync(dir).sort()).toEqual(expected)
      for (const name of expected) expect(statSync(join(dir, name)).size).toBeLessThanOrEqual(200)
    })

    it('measures lines in bytes, not characters', () => {
      const path = join(dir, 'd.log')
      // 30 Cyrillic letters are 60 bytes: three such lines cross 200 bytes, as characters they would not.
      write(path, { maxSizeBytes: 200, maxFiles: 2, format: 'text' }, [
        'ж'.repeat(30),
        'ж'.repeat(30),
        'ж'.repeat(30),
      ])
      expect(readdirSync(dir)).toContain('d.log.1')
    })

    it('keeps the newest lines in the live file and the ones before in .1', () => {
      const path = join(dir, 'd.log')
      write(path, { maxSizeBytes: 120, maxFiles: 2, format: 'text' }, ['one', 'two', 'three', 'four', 'five'])
      const live = readFileSync(path, 'utf8')
      expect(live).toContain('five')
      expect(readFileSync(`${path}.1`, 'utf8') + live).toContain('four')
    })

    it('writes the human line with a timestamp in text format, JSON otherwise', () => {
      const text = join(dir, 't.log')
      const json = join(dir, 'j.log')
      createLogger(fileSink(text, { maxSizeBytes: 1e6, maxFiles: 2, format: 'text' }), {
        level: 'info',
        scope: 'core',
        now: () => 0,
      }).warn('hot')
      createLogger(fileSink(json, { maxSizeBytes: 1e6, maxFiles: 2 }), { level: 'info', now: () => 0 }).info(
        'x',
        { a: 1 }
      )
      expect(readFileSync(text, 'utf8')).toBe('1970-01-01T00:00:00.000Z [warn] core: hot\n')
      expect(JSON.parse(readFileSync(json, 'utf8'))).toMatchObject({ level: 'info', message: 'x', a: 1 })
    })
  })
})
