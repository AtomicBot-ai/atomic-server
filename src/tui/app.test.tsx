import type { CoreSnapshot } from '@atomic-chat/core/client'
import { render } from 'ink'
import { afterEach, describe, expect, it } from 'vitest'
import { eventually, fakeTerminal, KEYS } from '../../test/helpers/fake-terminal.js'
import type { FakeTerminal } from '../../test/helpers/fake-terminal.js'
import { ROOT } from '../commands/index.js'
import { App, layoutFor } from './app.js'
import type { TuiCommand } from './keys.js'
import type { ConfigRow, TabId, TuiAction } from './state.js'

const NOW = new Date('2026-09-24T12:00:00Z')

const snapshot = {
  instance_id: '7f3a1c2b9d',
  protocol: 1,
  version: '0.5.1',
  pid: 4121,
  data_folder: '/srv/atc/a/folder/with/a/path/long/enough/to/be/cut/at/the/edge/of/a/hundred/column/screen',
  cursor: 'x:0',
  sessions: [
    {
      provider: 'llamacpp-upstream',
      model_id: 'qwen3-8b',
      port: 8001,
      pid: 77,
      model_path: '',
      is_embedding: false,
      api_key: '',
    },
  ],
  server: { running: true, host: '0.0.0.0', port: 1337, prefix: '/v1', requires_api_key: true, pid: 4121 },
  clients: [],
  downloads: [],
} as unknown as CoreSnapshot

const record = {
  schema_version: 1 as const,
  pid: 4121,
  instance_id: '7f3a1c2b9d',
  state: 'ready' as const,
  atc_version: '0.1.0',
  core_version: '0.5.1',
  control_url: 'http://127.0.0.1:1',
  admin_url: 'http://127.0.0.1:1338',
  started_at: NOW.getTime() - (2 * 3600 + 14 * 60) * 1000,
}

const rows: ConfigRow[] = [
  {
    path: 'api.port',
    type: 'number',
    value: '1337',
    source: 'default',
    description: 'Port of the API',
    values: undefined,
  },
  {
    path: 'api.cors',
    type: 'boolean',
    value: 'true',
    source: 'file',
    description: 'CORS headers',
    values: undefined,
  },
]

let mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const m of mounted) m.unmount()
  mounted = []
})

function mount(options: { tab?: TabId; terminal?: FakeTerminal } = {}) {
  const terminal = options.terminal ?? fakeTerminal(100, 30)
  const commands: TuiCommand[] = []
  let dispatch: (action: TuiAction) => void = () => undefined
  const instance = render(
    <App
      initialTab={options.tab ?? 'overview'}
      theme={{ color: false }}
      createController={(d) => {
        dispatch = d
        return { start: () => undefined, dispose: () => undefined, run: async (c) => void commands.push(c) }
      }}
      now={() => NOW}
      dataFolder="/srv/atc"
      logPath="/srv/atc/atc/logs/daemon.log"
      root={ROOT}
    />,
    { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
  )
  mounted.push(instance)
  const frame = () => terminal.stdout.lastFrame()
  return {
    terminal,
    commands,
    instance,
    frame,
    dispatch: (action: TuiAction) => dispatch(action),
    press: (data: string) => terminal.stdin.press(data),
    sees: (text: string) => eventually(() => frame().includes(text), `"${text}" on screen`),
  }
}

const up: TuiAction = { type: 'daemon', daemon: { kind: 'up', snapshot, record, pending: [] } }

describe('the terminal UI', () => {
  it('shows the admin dashboard cards in its words once the server is up', async () => {
    const ui = mount()
    await ui.sees('connecting to the server')
    ui.dispatch(up)
    await ui.sees('Loaded models')
    const frame = ui.frame()
    for (const text of [
      'Server',
      'pid 4121 · up 2h 14m',
      'Core',
      '0.5.1 · instance 7f3a1c2b…',
      'http://0.0.0.0:1337/v1 · key required',
    ]) {
      expect(frame).toContain(text)
    }
    expect(frame).toContain('qwen3-8b · llamacpp-upstream · :8001 · pid 77')
    // A long line is cut at the frame, never wrapped: each card stays one line.
    const lines = frame.split('\n')
    const at = lines.findIndex((l) => l.includes('data folder /srv/atc'))
    expect(lines[at]).toContain('…')
    expect(lines[at + 1]).toContain('Core')
    expect(frame).toContain('Pending host steps')
    expect(frame).toContain('http://127.0.0.1:1338 · atc 0.1.0')
    expect(frame).toContain('S stop')
    expect(frame).not.toContain('s start the server')
  })

  it('offers to start a stopped server and asks before stopping a running one', async () => {
    const ui = mount()
    ui.dispatch({ type: 'daemon', daemon: { kind: 'down', error: undefined } })
    await ui.sees('not running')
    expect(ui.frame()).toContain('s start the server')
    ui.press('s')
    await eventually(() => ui.commands.length === 1)
    expect(ui.commands).toEqual([{ name: 'start' }])

    ui.dispatch(up)
    await ui.sees('S stop')
    ui.press('S')
    await ui.sees('Stop the server?')
    ui.press('n')
    await ui.sees('Loaded models')
    ui.press('S')
    await ui.sees('Stop the server?')
    ui.press('y')
    await eventually(() => ui.commands.length === 2)
    expect(ui.commands[1]).toEqual({ name: 'stop' })
  })

  it('switches screens by arrows, number and tab, shows help, and quits on q', async () => {
    const ui = mount()
    ui.press(KEYS.left)
    await ui.sees('run it in a shell')
    ui.press(KEYS.right)
    await ui.sees('connecting to the server')
    ui.press(KEYS.right)
    await ui.sees('the log is empty')
    ui.press('1')
    await ui.sees('connecting to the server')
    ui.press('2')
    await ui.sees('the log is empty')
    ui.press(KEYS.tab)
    await ui.sees('reading the config')
    ui.press('?')
    await ui.sees('Every action here is also a plain command')
    ui.press(KEYS.escape)
    await ui.sees('reading the config')
    ui.press('q')
    await ui.instance.waitUntilExit()
  })

  it('opens the doctor screen by asking the controller to run the checks', async () => {
    const ui = mount({ tab: 'doctor' })
    await ui.sees('running the checks')
    await eventually(() => ui.commands.some((c) => c.name === 'doctor'))
    ui.dispatch({
      type: 'doctor-results',
      results: [{ id: 'x', title: 'data folder', status: 'warn', message: 'slow', hint: 'look' }],
    })
    await ui.sees('warn  data folder: slow')
    expect(ui.frame()).toContain('→ look')
  })

  it('edits a config value inline and toggles a boolean at once', async () => {
    const ui = mount({ tab: 'config' })
    ui.dispatch({ type: 'config-rows', rows, warnings: [] })
    await ui.sees('api.port')
    ui.press(KEYS.enter)
    await ui.sees('⏎ save · esc cancel')
    ui.press(KEYS.backspace)
    ui.press('8')
    await ui.sees('1338')
    ui.press(KEYS.enter)
    await eventually(() => ui.commands.length === 1)
    expect(ui.commands[0]).toEqual({ name: 'config-set', key: 'api.port', raw: '1338' })
    ui.press(KEYS.down)
    await ui.sees('CORS headers')
    ui.press(KEYS.enter)
    await eventually(() => ui.commands.length === 2)
    expect(ui.commands[1]).toEqual({ name: 'config-set', key: 'api.cors', raw: 'false' })
  })

  it('filters and scrolls the log', async () => {
    const ui = mount({ tab: 'logs' })
    ui.dispatch({ type: 'logs-reset', lines: ['[info] one', '[warn] two', '[info] three'] })
    await ui.sees('[info] three')
    ui.press('/')
    for (const c of 'warn') ui.press(c)
    await ui.sees('filter "warn" · 1 of 3 lines')
    expect(ui.frame()).not.toContain('[info] one')
    ui.press(KEYS.enter)
    ui.press(KEYS.escape)
    await ui.sees('[info] one')
  })

  it('keeps the logo and the name on every screen, so switching screens moves nothing', async () => {
    const ui = mount()
    await ui.sees('Local models behind an OpenAI-compatible API')
    expect(ui.frame()).toContain('▄█▄  ██  ▄█▄')
    ui.dispatch({ type: 'daemon', daemon: { kind: 'down', error: undefined } })
    await ui.sees('s start the server')
    const tabsAt = (frame: string) => frame.split('\n').findIndex((l) => l.includes('1 Overview'))
    const overview = tabsAt(ui.frame())
    for (const key of ['2', '3', '4', '?']) {
      ui.press(key)
      await eventually(() => ui.frame().includes('Local models behind'), `the logo after ${key}`)
      expect(tabsAt(ui.frame()), `tab bar after ${key}`).toBe(overview)
    }
    expect(ui.frame()).toContain('Every action here is also a plain command')
    expect(ui.frame()).not.toContain('✳ Atomic Server')
  })

  it('shows one brand line instead on a small terminal', async () => {
    const ui = mount({ terminal: fakeTerminal(80, 20) })
    await ui.sees('✳ Atomic Server · atc 0.1.0')
    expect(ui.frame()).not.toContain('Local models behind')
  })

  it('fits the help under the welcome box on an 80×24 terminal', async () => {
    const ui = mount({ terminal: fakeTerminal(80, 24) })
    ui.press('?')
    await ui.sees('Every action here is also a plain command')
    expect(ui.frame()).toContain('Keys · esc or ? closes')
    expect(ui.frame()).toContain('Local models behind')
    expect(ui.frame()).toContain('Doctor    r run again')
  })

  it.each([
    ['a tall terminal', 100, 30, { welcome: true, bodyRows: 15 }],
    ['the classic 80×24', 80, 24, { welcome: true, bodyRows: 9 }],
    ['a short terminal', 100, 23, { welcome: false, bodyRows: 17 }],
    ['a narrow terminal', 60, 30, { welcome: false, bodyRows: 24 }],
  ] as const)('lays out %s', (_name, columns, rows, expected) => {
    expect(layoutFor(columns, rows)).toEqual(expected)
  })

  it('lists every command with its status, and opens its full help', async () => {
    const ui = mount({ tab: 'commands' })
    await ui.sees('Server')
    const frame = ui.frame()
    expect(frame).toContain('› control')
    // One line per command: the status stays on the same line as the name.
    expect(frame.split('\n').find((l) => l.includes('› control'))).toContain('group')
    expect(frame).toContain('Typed server operations for scripts and agents')
    expect(frame).toContain('control list')
    expect(frame).toContain('works')
    expect(frame).not.toContain('daemon')
    ui.press(KEYS.enter)
    await ui.sees('Usage: atc control')
    expect(ui.frame()).toContain('List operation names')
    ui.press(KEYS.escape)
    await ui.sees('run it in a shell: atc control')
    ui.press(KEYS.down)
    await ui.sees('›   control list')
    ui.press(KEYS.enter)
    await ui.sees('Usage: atc control list')
    expect(ui.frame()).toContain('works')
  })

  it('says so when the terminal is too small, and recovers on resize', async () => {
    const terminal = fakeTerminal(60, 8)
    const ui = mount({ terminal })
    await ui.sees('The terminal is too small (60×8)')
    terminal.stdout.resize(100, 30)
    await ui.sees('connecting to the server')
  })
})
