import { readyWorkspace } from '../helpers/ready-workspace.js'
/** Commands against a fake core: what they print, what they call, how they fail. */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { eventually, fakeTerminal } from '../helpers/fake-terminal.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())

describe('status and lifecycle', () => {
  it('reports a stopped daemon and a running one', async () => {
    t = testRun({ running: false })
    expect(await t.run(['status', '--json'])).toBe(0)
    expect(JSON.parse(t.io.out.join(''))).toMatchObject({ running: false })
    t.cleanup()
    t = testRun({ running: true })
    expect(await t.run(['status'])).toBe(0)
    expect(t.io.out.join('')).toContain('running (pid 4242')
    expect(t.io.out.join('')).toContain('none loaded')
  })

  it('starts when nothing runs, says so when it already does, and stops through a lease', async () => {
    t = testRun({ running: false })
    expect(await t.run(['start', '--json'])).toBe(0)
    expect(JSON.parse(t.io.out.join(''))).toMatchObject({ started: true, pid: 4242 })
    t.io.out.length = 0
    expect(await t.run(['start', '--json'])).toBe(0)
    expect(JSON.parse(t.io.out.join(''))).toMatchObject({ started: false })
    t.cleanup()
    t = testRun({ running: false })
    expect(await t.run(['stop', '--json'])).toBe(0)
    expect(JSON.parse(t.io.out.join(''))).toMatchObject({ stopped: false })
  })
})

describe('config', () => {
  it('sets, gets, lists and unsets keys in the file', async () => {
    t = testRun()
    expect(await t.run(['config', 'set', 'api.port', '4000'])).toBe(0)
    expect(readFileSync(t.io.env['ATC_DATA_FOLDER'] + '/atc/config.json', 'utf8')).toContain('4000')
    t.io.out.length = 0
    expect(await t.run(['config', 'get', 'api.port'])).toBe(0)
    expect(t.io.out.join('')).toBe('4000\n')
    t.io.out.length = 0
    expect(await t.run(['config', 'list', '--json'])).toBe(0)
    expect(JSON.parse(t.io.out.join(''))).toMatchObject({
      values: { api: { port: 4000 } },
      sources: { 'api.port': 'file' },
    })
    expect(await t.run(['config', 'unset', 'api.port'])).toBe(0)
    t.io.out.length = 0
    expect(await t.run(['config', 'get', 'api.port'])).toBe(0)
    expect(t.io.out.join('')).toBe('1337\n')
    expect(await t.run(['config', 'set', 'api.port', 'many'])).toBe(1)
    expect(await t.run(['config', 'get', 'nope.key'])).toBe(2)
    // A provider this server does not register (the fake core lists none): engine.* is test/contract/config-engine.test.ts.
    expect(await t.run(['config', 'get', 'engine.llamacpp.ctx_size'])).toBe(2)
  })
})

describe('telemetry', () => {
  it('hands a changed consent to the running server at once, and only to a running one', async () => {
    t = testRun()
    expect(await t.run(['config', 'set', 'telemetry.enabled', 'false'])).toBe(0)
    expect(t.link.calls).toContainEqual(
      expect.objectContaining({ method: 'PUT', path: '/telemetry', body: { enabled: false } })
    )
    t.cleanup()
    t = testRun({ running: false })
    expect(await t.run(['config', 'set', 'telemetry.enabled', 'true'])).toBe(0)
    expect(t.link.calls).toEqual([])
  })

  it('says once, after the first start, that reports go out and how to stop them', async () => {
    t = testRun({ running: false })
    expect(await t.run(['start'])).toBe(0)
    expect(t.io.err.join('')).toContain('atc config set telemetry.enabled false')
    t.io.err.length = 0
    expect(await t.run(['start'])).toBe(0)
    expect(t.io.err.join('')).not.toContain('telemetry')
  }, 120_000)
})

describe('admin and doctor', () => {
  it('prints a login link only when the daemon has an admin', async () => {
    t = testRun()
    expect(await t.run(['admin', '--no-open'])).toBe(1)
    expect(t.io.err.join('')).toContain('no web admin')
    t.io.err.length = 0
    expect(await t.run(['admin', 'token'])).toBe(0)
    expect(t.io.out.join('').trim().length).toBeGreaterThan(40)
    expect(await t.run(['admin', 'status', '--json'])).toBe(0)
  })

  it('runs the doctor and reports a summary', async () => {
    t = testRun()
    const code = await t.run(['doctor', '--json'])
    const body = JSON.parse(t.io.out.join('')) as {
      status: string
      checks: Array<{ id: string; status: string }>
    }
    expect(body.checks.map((c) => c.id)).toContain('data-folder')
    expect(body.checks.find((c) => c.id === 'data-folder')?.status).toBe('ok')
    expect(['ok', 'warn']).toContain(body.status)
    expect(code).toBe(0)
  })

  it('shows logs, and refuses --follow with --json', async () => {
    t = testRun()
    expect(await t.run(['logs'])).toBe(0)
    expect(t.io.err.join('')).toContain('no log yet')
    expect(await t.run(['logs', '-f', '--json'])).toBe(2)
  })
})

describe('the terminal UI', () => {
  it('needs a terminal: `atc tui` without one is a usage error, bare `atc` prints help', async () => {
    t = testRun()
    expect(await t.run(['tui'])).toBe(2)
    expect(t.io.err.join('')).toContain('The terminal UI needs an interactive terminal.')
    expect(t.io.err.join('')).toContain('atc status --json')
    expect(await t.run(['tui', '--screen', 'missing'])).toBe(2)
    expect(t.io.err.join('')).toContain("Unknown screen 'missing'")
    expect(await t.run([])).toBe(2)
    expect(t.io.out.join('')).toContain('Usage: atc <command>')
  })

  it('opens on bare `atc` in a terminal, shows the daemon, and leaves on Ctrl+Q without stopping it', async () => {
    const terminal = fakeTerminal(100, 30)
    t = testRun({
      io: {
        terminal: terminal.streams,
        isTTY: { stdin: true, stdout: true, stderr: true },
        waitForShutdown: () => new Promise<void>(() => undefined),
      },
    })
    readyWorkspace(t.io.env['ATC_DATA_FOLDER']!)
    // Module transformation is outside the two-second interactive render deadline.
    await import('../../src/tui/run-tui.js')
    const exit = t.run([])
    await eventually(() => terminal.stdout.text().includes('Agents & tools'), 'server')
    expect(terminal.stdout.text()).not.toContain('Press any key')
    expect(terminal.stdout.text()).not.toContain('SET UP SERVER')
    terminal.stdin.press('\u0007')
    terminal.stdin.press('s')
    await eventually(() => terminal.stdout.text().includes('Network & API'), 'settings')
    terminal.stdin.press('\u0011')
    expect(await exit).toBe(0)
    expect(t.link.shutdowns).toBe(0)
    // Back from the alternate screen: the shell's scrollback is as it was.
    expect(terminal.stdout.writes.join('')).toContain('\u001b[?1049l')
    // Nothing was written around the frame.
    expect(t.io.err.join('')).toBe('')
  })

  it('keeps `--json` on a terminal a usage error rather than a screen', async () => {
    const terminal = fakeTerminal()
    t = testRun({ io: { terminal: terminal.streams, isTTY: { stdin: true, stdout: true, stderr: true } } })
    expect(await t.run(['tui', '--json'])).toBe(2)
    expect(await t.run(['--json'])).toBe(2)
    expect(terminal.stdout.writes).toEqual([])
  })
})
