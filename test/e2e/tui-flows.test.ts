/**
 * Terminal UI journeys on the built program, in a real pseudo-terminal, where this change found bugs:
 * LiteRT-LM in the Local models catalog (its format, its families, a variant waiting on its engine), and a
 * config file from before `tui.mode` left (version 4).
 * Nothing reaches the network: conf's LiteRT-LM list is a fixture file, the Hub a closed loopback port.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, ROOT, runAtc } from '../helpers/binary.js'
import { hasPython, runPty } from '../helpers/pty-driver.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-tui-flows-'))
// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
const env = {
  ...process.env,
  HF_ENDPOINT: 'http://127.0.0.1:9',
  ATC_LITERT_LM_MODELS_URL: pathToFileURL(join(ROOT, 'test/fixtures/litert-lm/litert-lm-models.json')).href,
}

/** A returning user's data folder with a free admin port and a cached GGUF catalog. */
function ready(name: string) {
  const folder = join(scratch, name)
  readyWorkspace(folder)
  expect(runAtc(['config', 'set', 'admin.port', '0', '--data-folder', folder]).code).toBe(0)
  // The animated eye redraws the screen every 140 ms; a still screen is what a click reads.
  expect(runAtc(['config', 'set', 'tui.motion', 'false', '--data-folder', folder]).code).toBe(0)
  mkdirSync(join(folder, 'atc', 'cache'), { recursive: true })
  writeFileSync(
    join(folder, 'atc', 'cache', 'workspace-staff-picks.json'),
    JSON.stringify({
      at: Date.now(),
      data: { picks: [{ model_name: 'fixture/tui', title: 'Fixture model', format: 'gguf' }] },
    })
  )
  return folder
}
afterAll(() => {
  for (const name of ['litert', 'config-v4'])
    runAtc(['--data-folder', join(scratch, name), 'stop', '--force', '--kill'])
  rmSync(scratch, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32' || !hasPython())(`atc tui journeys (${ATC.join(' ')})`, () => {
  it('lists LiteRT-LM families in Local models from the format filter and opens a variant’s engine in its own panel', () => {
    const folder = ready('litert')
    const result = runPty(
      [
        { wait: 'Agents & tools' },
        { type: '\u001b2' },
        { wait: 'Filters' },
        { click: 'Filters' },
        { wait: 'Format: LiteRT-LM' },
        { click: 'Format: LiteRT-LM' },
        // The filters popover covers the list until it closes.
        { type: '\u001b' },
        { wait: 'Gemma 3 1B', fresh: true },
        { click: 'Gemma 4 E4B' },
        { wait: 'Install engine', fresh: true },
        // The engine's own panel: its install prepares accelerators after it, which a plain build install skips.
        { click: 'Install engine' },
        { wait: 'Not installed', fresh: true },
        { type: '\u0011' },
      ],
      [...ATC, '--data-folder', folder],
      env
    )
    const screen = strip(result.out)
    expect(result.ok, result.failed.join(', ') + '\n' + screen.slice(-3000)).toBe(true)
    expect(result.code, screen.slice(-2000)).toBe(0)
    // The LiteRT-LM panel, not a generic build list that would install around openvino.
    expect(screen.slice(screen.lastIndexOf('Not installed') - 400)).toContain('LiteRT-LM')
    expect(screen).not.toContain('Install latest build')
  })

  it('opens on a config file from before tui.mode left, and lists the migrated settings without it', () => {
    const folder = ready('config-v4')
    const file = join(folder, 'atc', 'config.json')
    writeFileSync(
      file,
      JSON.stringify({ version: 4, admin: { port: 0 }, tui: { mode: 'personal', motion: false } })
    )
    const result = runPty(
      [{ wait: 'Agents & tools' }, { type: '\u0011' }],
      [...ATC, '--data-folder', folder],
      env
    )
    expect(result.ok, strip(result.out).slice(-2000)).toBe(true)
    expect(result.code).toBe(0)
    const list = runAtc(['config', 'list', '--json', '--data-folder', folder])
    expect(list.code, list.err).toBe(0)
    const config = JSON.parse(list.out) as { values: { version: number; tui: Record<string, unknown> } }
    expect(config.values.version).toBe(5)
    expect(config.values.tui).not.toHaveProperty('mode')
    expect(config.values.tui['motion']).toBe(false)
  })
})
