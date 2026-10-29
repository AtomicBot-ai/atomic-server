/** Editor recovery and long Tools menus on the built program in a real PTY. No engine or network. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, runAtc } from '../helpers/binary.js'
import { hasPython, runPty } from '../helpers/pty-driver.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-editors-tools-'))
const folders: string[] = []
const env = { ...process.env, HF_ENDPOINT: 'http://127.0.0.1:9' }
afterAll(() => {
  for (const folder of folders) runAtc(['--data-folder', folder, 'stop', '--force', '--kill'])
  rmSync(scratch, { recursive: true, force: true })
})
function ready(name: string) {
  const folder = join(scratch, name)
  folders.push(folder)
  readyWorkspace(folder)
  const file = join(folder, 'atc', 'config.json')
  writeFileSync(
    file,
    JSON.stringify({
      version: 5,
      admin: { port: 0 },
      api: { autoStart: false },
      tui: { motion: false },
      proxy: { url: 'http://127.0.0.1:9' },
      update: { checkOnStart: false },
      telemetry: { enabled: false },
    })
  )
  return folder
}
function check(result: ReturnType<typeof runPty>) {
  expect(result.ok, result.failed.join(', ') + '\n' + result.out.slice(-5000)).toBe(true)
  expect(result.code, result.out.slice(-2000)).toBe(0)
}

describe.skipIf(process.platform === 'win32' || !hasPython())('terminal editors and Tools', () => {
  it('shows document and URL refusals in the retained editor, then accepts a corrected document', () => {
    const folder = ready('editor'),
      valid = join(folder, 'notes.txt')
    writeFileSync(valid, 'Synthetic document for editor recovery.')
    check(
      runPty(
        [
          { wait: 'Agents & tools' },
          { click: 'Playground' },
          { click: 'Files' },
          { click: 'Document' },
          { wait: 'Attach document' },
          { type: join(folder, 'missing.txt') },
          { type: '\r' },
          { wait: 'ENOENT', fresh: true },
          { type: '\u0015' },
          { type: valid },
          { type: '\r' },
          { wait: 'Files 1', fresh: true },
          { click: 'Choose model' },
          { type: '\u001b[B' },
          { type: '\u001b[B' },
          { click: 'Connect an endpoint' },
          { wait: 'Connect a model endpoint' },
          { type: '\u0015' },
          { type: 'file:///tmp' },
          { type: '\r' },
          { wait: 'Use an HTTP endpoint without credentials', fresh: true },
          { type: '\u0011' },
        ],
        [...ATC, '--data-folder', folder],
        env
      )
    )
  })

  it('reaches and toggles skill twenty in a 54×24 terminal', () => {
    const folder = ready('tools')
    for (let i = 0; i < 20; i++) {
      const result = runAtc([
        '--data-folder',
        folder,
        'control',
        'call',
        'skills.save',
        '--input',
        JSON.stringify({
          value: {
            name: `fixture-${i.toString().padStart(2, '0')}`,
            description: 'Fixture',
            body: 'Fixture',
            enabled: true,
          },
        }),
        '--json',
      ])
      expect(result.code, result.err).toBe(0)
    }
    check(
      runPty(
        [
          { wait: 'Agents & tools' },
          { click: 'Playground' },
          { click: 'Tools ▾' },
          { wait: 'Assistant, skills & tools' },
          { resize: [24, 54] },
          ...Array.from({ length: 21 }, () => ({ type: '\u001b[B' })),
          { type: '\r' },
          { wait: '[x] fixture-19', fresh: true },
          { type: '\u001b' },
          { type: '\u0011' },
        ],
        [...ATC, '--data-folder', folder],
        env
      )
    )
  })
})
