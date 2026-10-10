import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atcPathsFor, resolveConfig } from '../config/index.js'
import { takeTelemetryNotice, telemetryConsent } from './notice.js'

const config = (fileText?: string) => resolveConfig({ env: {}, ...(fileText ? { fileText } : {}) })
const chosen = (enabled: boolean) => config(JSON.stringify({ version: 4, telemetry: { enabled } }))

describe('telemetryConsent', () => {
  it.each([
    ['a --telemetry flag wins', true, chosen(false), true],
    ['an explicit config value is passed on', undefined, chosen(false), false],
    ['an explicit true is passed on too', undefined, chosen(true), true],
    ['the default leaves it to the core', undefined, config(), undefined],
  ] as const)('%s', (_name, flag, c, expected) => {
    expect(telemetryConsent(flag, c)).toBe(expected)
  })
})

describe('the one-time notice', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const folder = () => {
    const dir = mkdtempSync(join(tmpdir(), 'atc-notice-'))
    dirs.push(dir)
    return atcPathsFor(join(dir, 'data'))
  }

  it('is shown once per data folder and recorded in the core telemetry file', async () => {
    const paths = folder()
    expect(await takeTelemetryNotice({ config: config(), paths, env: {} })).toBe(true)
    expect(await takeTelemetryNotice({ config: config(), paths, env: {} })).toBe(false)
    expect(JSON.parse(readFileSync(paths.layout.core.telemetry, 'utf8'))).toMatchObject({
      notice_shown: true,
    })
  })

  it.each([
    ['the config decided', chosen(true), {}],
    ['the config turned them off', chosen(false), {}],
    ['DO_NOT_TRACK is set', config(), { DO_NOT_TRACK: '1' }],
    ['the environment is a test run', config(), { VITEST: 'true' }],
  ])('is not shown when %s', async (_name, c, env) => {
    expect(await takeTelemetryNotice({ config: c, paths: folder(), env })).toBe(false)
  })
})
