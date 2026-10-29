import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import type { FakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { eventually } from '../../test/helpers/fake-terminal.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import type { AtcPaths } from '../config/index.js'
import { readTextFile, resolveConfig } from '../config/index.js'
import { writeDaemonRecord } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import type { TuiDeps } from './controller.js'
import { oneLine, TuiController } from './controller.js'
import type { TuiAction } from './state.js'

let paths: AtcPaths
let cleanup: () => void
let link: FakeCoreLink
let running: boolean
let actions: TuiAction[]
let controller: TuiController

beforeEach(() => {
  ;({ paths, cleanup } = tmpDataFolder())
  link = fakeCoreLink({ data_folder: paths.dataFolder })
  running = true
  actions = []
})
afterEach(() => {
  controller?.dispose()
  cleanup()
})

function start(over: Partial<TuiDeps> = {}): TuiController {
  const deps: TuiDeps = {
    paths,
    attach: async (o) => {
      if (running || o.launch) {
        running = true
        return link
      }
      throw new AtcError('ATC_DAEMON_NOT_RUNNING', 'Atomic Server is not running for this data folder.')
    },
    loadConfig: async () => resolveConfig({ fileText: await readTextFile(paths.configFile), env: {} }),
    runDoctor: async () => [{ id: 'version', title: 'versions', status: 'ok', message: 'fine' }],
    pendingHostSteps: async () => [],
    loginUrl: async (url) => `${url}/#token`,
    openUrl: async () => undefined,
    now: () => new Date('2026-09-24T12:00:00Z'),
    ...over,
  }
  controller = new TuiController(deps, (a) => actions.push(a))
  controller.start()
  return controller
}

const last = <T extends TuiAction['type']>(type: T) =>
  actions.filter((a): a is Extract<TuiAction, { type: T }> => a.type === type).at(-1)

describe('TuiController', () => {
  it('reports an unexpected local action failure while still showing the error', async () => {
    const capture = vi.fn()
    const c = start({
      errors: { capture },
      openUrl: async () => {
        throw new TypeError('local action defect')
      },
    })
    await c.run({ name: 'open-url', url: 'https://example.com' })
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.objectContaining({ component: 'tui' }) })
    )
    expect(last('activity')?.line.text).toBe('local action defect')
  })
  it('reports the server, the config and the log as soon as it starts', async () => {
    start()
    await eventually(() => last('daemon')?.daemon.kind === 'up', 'daemon up')
    await eventually(() => last('config-rows') !== undefined, 'config rows')
    await eventually(() => last('logs-reset') !== undefined, 'log')
    expect(last('config-rows')?.rows.find((r) => r.path === 'api.port')?.value).toBe('1337')
  })

  it('says down when no server runs, and starts one on request', async () => {
    running = false
    start()
    await eventually(() => last('daemon')?.daemon.kind === 'down', 'daemon down')
    await writeDaemonRecord(paths.daemonRecord, {
      schema_version: 1,
      pid: 4242,
      instance_id: link.endpoint.instanceId,
      state: 'ready',
      atc_version: '0.1.0',
      core_version: '0.4.0',
      control_url: 'http://127.0.0.1:1',
      admin_url: 'http://127.0.0.1:1338',
      started_at: Date.now(),
    })
    await controller.run({ name: 'start' })
    expect(last('daemon')?.daemon.kind).toBe('up')
    expect(actions.filter((a) => a.type === 'busy').map((a) => a.text)).toEqual([
      'starting the server',
      undefined,
    ])
    expect(last('activity')?.line.text).toBe('server started')
  })

  it('points at the log when the server does not start', async () => {
    running = false
    start({
      attach: async () => {
        throw new AtcError('ATC_DAEMON_START_FAILED', 'Could not start the server.')
      },
    })
    await controller.run({ name: 'start' })
    expect(last('activity')?.line).toEqual({
      time: expect.any(Number),
      level: 'error',
      text: 'the server did not start: Could not start the server. — the Logs screen (2) says why',
    })
    expect(last('busy')?.text).toBeUndefined()
  })

  it('stops the server through a lease and shows it down at once', async () => {
    start()
    await eventually(() => last('daemon')?.daemon.kind === 'up', 'daemon up')
    await controller.run({ name: 'stop' })
    expect(link.shutdowns).toBe(1)
    expect(last('daemon')?.daemon.kind).toBe('down')
    expect(last('activity')?.line).toMatchObject({ level: 'info', text: 'server stopped' })
  })

  it('writes a config change like `config set`, and explains a refusal', async () => {
    start()
    await eventually(() => last('daemon')?.daemon.kind === 'up', 'daemon up')
    await controller.run({ name: 'config-set', key: 'api.port', raw: '1338' })
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).api.port).toBe(1338)
    expect(last('config-message')?.message).toEqual({
      level: 'info',
      text: 'api.port = 1338 — restart the server (R on Overview) to apply',
    })
    expect(last('config-rows')?.rows.find((r) => r.path === 'api.port')).toMatchObject({
      value: '1338',
      source: 'file',
    })

    await controller.run({ name: 'config-set', key: 'api.port', raw: 'many' })
    expect(last('config-message')?.message).toEqual({
      level: 'error',
      text: "api.port: 'many' is not a number.",
    })

    await controller.run({ name: 'config-unset', key: 'api.port' })
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).api.port).toBe(1337)
  })

  it('runs doctor, and builds the admin link only when the server has an admin', async () => {
    start()
    await controller.run({ name: 'doctor' })
    expect(actions.filter((a) => a.type.startsWith('doctor')).map((a) => a.type)).toEqual([
      'doctor-running',
      'doctor-results',
    ])
    await controller.run({ name: 'admin-link' })
    expect(last('overlay')?.overlay).toMatchObject({ kind: 'admin-link', url: undefined })
    await writeDaemonRecord(paths.daemonRecord, {
      schema_version: 1,
      pid: 1,
      instance_id: 'x',
      state: 'ready',
      atc_version: '0.1.0',
      core_version: '0.4.0',
      control_url: '',
      admin_url: 'http://127.0.0.1:1338',
      started_at: 0,
    })
    await controller.run({ name: 'admin-link' })
    expect(last('overlay')?.overlay).toEqual({
      kind: 'admin-link',
      url: 'http://127.0.0.1:1338/#token',
      error: undefined,
    })
  })

  it('puts an error on one line, with its hint', () => {
    expect(oneLine(new AtcError('ATC_USAGE', 'Bad.', { hint: 'try this' }))).toBe('Bad. — try this')
    expect(oneLine(new Error('plain'))).toBe('plain')
  })
})
