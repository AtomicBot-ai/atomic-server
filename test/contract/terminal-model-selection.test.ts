/** Wizard navigation and engine/model switching through real Ink, config and the workspace service. */
import { act, createElement } from 'react'
import { writeFileSync } from 'node:fs'
import { render } from 'ink'
import { afterEach, expect, it } from 'vitest'
import { ModelRegistry } from '@atomic-chat/core/models'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { hostedWorkspace } from '../helpers/hosted-workspace.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'
import { readTextFile, resolveConfig } from '../../src/config/index.js'
import { WorkspaceApp } from '../../src/tui/workspace/WorkspaceApp.js'
import type { WorkspaceDeps } from '../../src/tui/workspace/controller.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
async function mount(
  complete: boolean,
  prepare?: (link: ReturnType<typeof fakeCoreLink>, request: typeof fetch) => Promise<void>
) {
  const temp = tmpDataFolder(),
    terminal = fakeTerminal(120, 40),
    link = fakeCoreLink()
  cleanup.push(temp.cleanup)
  if (complete) readyWorkspace(temp.paths.dataFolder)
  const registry = new ModelRegistry(temp.paths.layout)
  await registry.write('a-first', { model_path: '/fixture/first.gguf', name: 'First GGUF' })
  await registry.write('b-second', { model_path: '/fixture/second.gguf', name: 'Second GGUF' })
  await new ModelRegistry(temp.paths.layout, 'mlx').write('c-mlx', {
    model_path: '/fixture/mlx',
    name: 'Apple fixture',
  })
  const build = { version: 'b1', variant: 'cpu' }
  link.responses['POST /engines/versions'] = {
    engines: [
      { engine: 'llamacpp-upstream', active: build, latest: build },
      { engine: 'llamacpp', active: build, latest: build },
      { engine: 'mlx', active: { version: 'm1', variant: 'macos-arm64' } },
    ],
  }
  for (const provider of ['llamacpp-upstream', 'llamacpp']) {
    link.responses[`POST /backends/${provider}/catalog`] = {
      provider,
      recommended: 'b1/cpu',
      available: [{ version: 'b1', backend: 'cpu' }],
    }
    link.responses[`GET /backends/${provider}`] = { backends: [{ version: 'b1', backend: 'cpu' }] }
  }
  const originalLoad = link.models.load
  link.models.load = async (provider, model) => {
    const result = await originalLoad(provider, model)
    link.snapshotValue.sessions = [{ ...result, provider, state: 'ready' } as never]
    return result
  }
  const hub: typeof fetch = async (url) =>
    String(url).includes('staff-picks.json')
      ? Response.json({ picks: [] })
      : String(url).includes('/api/models?')
        ? Response.json([])
        : Response.json({ data: [] })
  const config = async () => resolveConfig({ fileText: await readTextFile(temp.paths.configFile), env: {} })
  const request = hostedWorkspace(temp.paths, link, hub)
  await prepare?.(link, request)
  const deps: WorkspaceDeps = {
    apiKey: '',
    chatKey: '',
    request,
    base: {
      paths: temp.paths,
      attach: async () => link,
      loadConfig: config,
      runDoctor: async () => [],
      pendingHostSteps: async () => [],
      loginUrl: async () => '',
      openUrl: async () => {},
      now: () => new Date(),
    },
  }
  const ui = render(
    createElement(WorkspaceApp, {
      deps,
      showIntro: false,
      initialPage: 'chat',
      color: false,
      write: terminal.stdout.write,
    }),
    {
      ...terminal.streams,
      debug: true,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  )
  cleanup.push(async () => {
    ui.unmount()
    await ui.waitUntilExit()
  })
  const sees = async (text: string) =>
    eventually(() => terminal.stdout.lastFrame().includes(text), text).catch((e: Error) => {
      throw new Error(`${e.message}\n${terminal.stdout.lastFrame()}`)
    })
  const click = async (label: string) => {
    await sees(label)
    const lines = terminal.stdout.lastFrame().split('\n'),
      y = lines.findIndex((row) => row.includes(label)),
      x = lines[y]!.indexOf(label)
    terminal.stdin.press(`\u001b[<0;${x + 1};${y + 1}M`)
  }
  return { temp, terminal, link, ui, config, sees, click }
}

it.each(['Second GGUF', 'Apple fixture'])('retains %s through Continue → Escape → Continue', async (name) => {
  const t = await mount(false)
  await t.click(name)
  await t.click('Continue')
  await t.sees('Notifications')
  t.terminal.stdin.press('\u001b')
  await t.sees('Choose your first model')
  await t.sees(name)
  const row = t.terminal.stdout
    .lastFrame()
    .split('\n')
    .find((line) => line.includes(name))!
  expect(row).toContain('(o)')
  await t.click('Continue')
  await t.sees('Notifications')
  expect((await t.config()).values.tui.model).toBe(name === 'Second GGUF' ? 'b-second' : 'c-mlx')
  t.terminal.stdin.press('\u0011')
  await t.ui.waitUntilExit()
})

it('keeps a newly saved endpoint after an earlier local model load finishes', async () => {
  let finish!: () => void,
    loaded = false
  const gate = new Promise<void>((done) => {
    finish = done
  })
  const t = await mount(true, async (link) => {
    const load = link.models.load
    link.models.load = async (...args) => {
      await gate
      const result = await load(...args)
      loaded = true
      return result
    }
  })
  await t.sees('How can I help you today?')
  t.terminal.stdin.press('Retain my draft')
  await t.click('Choose model')
  await t.click('Apple fixture')
  await t.sees('Loading model')
  await t.click('c-mlx ▾')
  for (let i = 0; i < 3; i++) t.terminal.stdin.press('\u001b[B')
  await t.click('Connect an endpoint')
  await t.sees('Connect a model endpoint')
  t.terminal.stdin.press('\u0015')
  t.terminal.stdin.press('http://127.0.0.1:9/new-endpoint')
  t.terminal.stdin.press('\r')
  await t.sees('Connection saved.')
  finish()
  await eventually(() => loaded, 'old load finishes')
  // Flush the model-load continuation through the real persistence transport.
  await t.click('Choose model')
  await t.sees('Inference engine')
  expect((await t.config()).values.tui).toMatchObject({
    endpoint: 'http://127.0.0.1:9/new-endpoint',
    model: '',
  })
  expect(t.terminal.stdout.lastFrame()).toContain('Retain my draft')
})

it('marks a full MLX build identifier saved by another workspace client on a fresh launch', async () => {
  const t = await mount(true, async (_link, request) => {
    const reply = await request('http://fixture/api/workspace/execute', {
      method: 'POST',
      body: JSON.stringify({ operation: 'engines.select', input: { engine: 'mlx' } }),
    })
    expect(reply.ok).toBe(true)
  })
  await t.sees('How can I help you today?')
  await t.click('Choose model')
  await t.click('Inference engine')
  await t.sees('✓ MLX')
  const saved = JSON.parse((await readTextFile(t.temp.paths.atcDir + '/engine-choice.json'))!).id
  expect(saved).toBe('mlx|m1|macos-arm64')
})

it('shows document and URL errors in the open editor and clears the recovered document error', async () => {
  const t = await mount(true)
  const missing = t.temp.paths.dataFolder + '/missing.txt',
    valid = t.temp.paths.dataFolder + '/notes.txt'
  writeFileSync(valid, 'Synthetic attachment')
  await t.sees('How can I help you today?')
  await t.click('Files')
  await t.click('Document')
  t.terminal.stdin.press(missing)
  t.terminal.stdin.press('\r')
  await t.sees('ENOENT')
  expect(t.terminal.stdout.lastFrame()).toContain('Attach document')
  t.terminal.stdin.press('\u0015')
  t.terminal.stdin.press(valid)
  t.terminal.stdin.press('\r')
  await t.sees('Files 1')
  expect(t.terminal.stdout.lastFrame()).not.toContain('ENOENT')
  await t.click('Choose model')
  for (let i = 0; i < 6; i++) t.terminal.stdin.press('\u001b[B')
  await t.click('Connect an endpoint')
  await t.sees('Connect a model endpoint')
  t.terminal.stdin.press('\u0015')
  t.terminal.stdin.press('not-a-url')
  t.terminal.stdin.press('\r')
  await t.sees('Invalid URL')
  expect(t.terminal.stdout.lastFrame()).toContain('not-a-url_')
})

it('navigates to the last of twenty workspace skills in a compact Tools popup', async () => {
  const t = await mount(true, async (_link, request) => {
    for (let i = 0; i < 20; i++) {
      const response = await request('http://fixture/api/workspace/execute', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'skills.save',
          input: {
            value: {
              name: `test-skill-${i.toString().padStart(2, '0')}`,
              description: 'Fixture',
              body: 'Fixture',
              enabled: true,
            },
          },
        }),
      })
      expect(response.ok).toBe(true)
    }
  })
  await t.sees('How can I help you today?')
  await act(async () => {
    t.terminal.stdout.resize(54, 24)
  })
  await t.click('Tools ▾')
  await t.sees('Assistant, skills & tools')
  // Flush input-listener effects between events, including those triggered by a viewport update.
  await act(async () => {})
  for (let i = 0; i < 21; i++) {
    await act(async () => {
      t.terminal.stdin.press('\u001b[B')
    })
  }
  await t.sees('test-skill-19')
  t.terminal.stdin.press('\r')
  await t.sees('[x] test-skill-19')
  t.terminal.stdin.press('\u001b')
  await t.sees('Tools ▾')
  expect(t.terminal.stdout.lastFrame()).not.toContain('Assistant, skills & tools')
})

it('switches TurboQuant → MLX by model, marks MLX, and persists that engine for the next launch', async () => {
  const t = await mount(true)
  await t.sees('How can I help you today?')
  await t.click('Choose model')
  await t.click('Inference engine')
  await t.sees('llama.cpp TurboQuant')
  await t.click('llama.cpp TurboQuant')
  await t.sees('TurboQuant selected')
  await t.click('Choose model')
  await t.click('Apple fixture')
  await t.sees('Model loaded.')
  expect(t.link.calls.some((c) => c.path === '/models/mlx/c-mlx/load')).toBe(true)
  expect((await t.config()).values.tui.model).toBe('c-mlx')
  expect(JSON.parse((await readTextFile(t.temp.paths.atcDir + '/engine-choice.json'))!).id).toBe('mlx')
  await t.click('c-mlx ▾')
  await t.click('Inference engine')
  await t.sees('✓ MLX')
  expect(t.terminal.stdout.lastFrame()).not.toContain('✓ llama.cpp TurboQuant')
  t.terminal.stdin.press('\u001b')
  t.terminal.stdin.press('\u0011')
  await t.ui.waitUntilExit()
})
