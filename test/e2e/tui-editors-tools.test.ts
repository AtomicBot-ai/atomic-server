/** Editor recovery and long Tools menus on the built program in a real PTY. No engine or external network. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, runAtc } from '../helpers/binary.js'
import { DRIVER, hasPython, runPty, type PtyResult } from '../helpers/pty-driver.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'
import { runAtcAsync, runProcess } from '../helpers/async-binary.js'
import { reportCollector } from '../helpers/report-collector.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-editors-tools-'))
const folders: string[] = []
const env = { ...process.env, HF_ENDPOINT: 'http://127.0.0.1:9' }
afterAll(() => {
  for (const folder of folders) runAtc(['--data-folder', folder, 'stop', '--force', '--kill'])
  rmSync(scratch, { recursive: true, force: true })
})
function ready(name: string, telemetry = false) {
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
      telemetry: { enabled: telemetry },
    })
  )
  return folder
}
function check(result: ReturnType<typeof runPty>) {
  expect(result.ok, result.failed.join(', ') + '\n' + result.out.slice(-5000)).toBe(true)
  expect(result.code, result.out.slice(-2000)).toBe(0)
}

describe.skipIf(process.platform === 'win32' || !hasPython())('terminal editors and Tools', () => {
  it('keeps document refusals out of Sentry, retains the editor, and accepts a corrected path', async () => {
    const folder = ready('editor', true),
      valid = join(folder, 'notes.txt'),
      collector = await reportCollector()
    writeFileSync(valid, 'Synthetic document for editor recovery.')
    const reportingEnv = {
      ...env,
      TERM: 'xterm-256color',
      ATC_SENTRY_DSN: collector.dsn,
      ATC_SENTRY_ENVIRONMENT: 'e2e',
      DO_NOT_TRACK: '0',
      ATOMIC_CORE_TELEMETRY: '1',
    }
    try {
      const result = await runProcess(
        'python3',
        [
          '-c',
          DRIVER,
          JSON.stringify([
            { wait: 'Agents & tools' },
            { click: 'Playground' },
            { click: 'Files' },
            { click: 'Document' },
            { wait: 'Attach document' },
            { type: folder },
            { type: '\r' },
            { wait: 'Choose a document file.', fresh: true },
            { type: '\u0015' },
            { type: join(folder, 'missing.txt') },
            { type: '\r' },
            { wait: 'That document was not found.', fresh: true },
            { type: '\u0015' },
            { type: '\r' },
            { wait: 'Choose a document file.', fresh: true },
            { type: valid },
            { type: '\r' },
            { wait: 'Files 1', fresh: true },
            { type: '\u0011' },
          ]),
          ...ATC,
          '--data-folder',
          folder,
        ],
        { env: reportingEnv, timeoutMs: 90_000 }
      )
      expect(result.code, result.err).toBe(0)
      check(JSON.parse(result.out.trim().split('\n').at(-1)!) as PtyResult)
      // The server owns its own reporter; flush it too before checking the local collector.
      const stopped = await runAtcAsync(['--data-folder', folder, 'stop', '--force', '--kill'], {
        env: reportingEnv,
      })
      expect(stopped.code, stopped.err).toBe(0)
      expect(collector.events).toEqual([])
    } finally {
      await collector.close()
    }
  })

  it('shows a URL refusal in the retained endpoint editor', () => {
    const folder = ready('endpoint')
    check(
      runPty(
        [
          { wait: 'Agents & tools' },
          { resize: [40, 120] },
          { click: 'Playground' },
          { click: 'Choose model' },
          { wait: 'Choose a model' },
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
