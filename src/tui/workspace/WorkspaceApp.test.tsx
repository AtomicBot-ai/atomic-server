import { hostedWorkspace } from '../../../test/helpers/hosted-workspace.js'
import { saveWorkspaceSetup } from '../../workspace-service/index.js'
import { readyWorkspace } from '../../../test/helpers/ready-workspace.js'
import { dirname } from 'node:path'
import { ChatHistory } from '../../terminal-data/index.js'
import { render } from 'ink'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { fakeTerminal, eventually, KEYS } from '../../../test/helpers/fake-terminal.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { readTextFile, resolveConfig } from '../../config/index.js'
import { WorkspaceApp } from './WorkspaceApp.js'
import type { WorkspaceDeps } from './controller.js'
import { WorkspaceController } from './controller.js'
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
function mount(fresh = false, showIntro = true) {
  const tmp = tmpDataFolder(),
    terminal = fakeTerminal(80, 24),
    link = fakeCoreLink(),
    attach = vi.fn(async (_options: { launch: boolean }) => link)
  if (!fresh) readyWorkspace(tmp.paths.dataFolder)
  let finishEngine = () => {}
  if (fresh) {
    link.responses['POST /engines/versions'] = {
      engines: [{ engine: 'llamacpp-upstream', latest: { version: 'test', variant: 'cpu' }, active: null }],
    }
    link.responses['POST /backends/llamacpp-upstream/catalog'] = {
      provider: 'llamacpp-upstream',
      recommended: 'test/cpu',
      available: [{ version: 'test', backend: 'cpu' }],
    }
    link.responses['GET /backends/llamacpp-upstream'] = { backends: [] }
    link.responses['POST /engines/llamacpp-upstream/update'] = () =>
      new Promise((resolve) => {
        finishEngine = () => resolve({})
      })
  }
  cleanup.push(tmp.cleanup)
  const historyWrites = vi.spyOn(ChatHistory.prototype, 'save')
  const request = vi.fn(async (url: unknown, _init?: RequestInit) =>
    String(url).endsWith('/models')
      ? Response.json({ data: [{ id: 'local-model' }] })
      : new Response('data: {"choices":[{"delta":{"content":"A real streamed reply"}}]}\n\ndata: [DONE]\n\n')
  )
  const deps: WorkspaceDeps = {
    request: fresh ? hostedWorkspace(tmp.paths, link, request as typeof fetch) : (request as typeof fetch),
    apiKey: 'test-key',
    chatKey: '',
    base: {
      paths: tmp.paths,
      attach,
      loadConfig: async () => resolveConfig({ fileText: await readTextFile(tmp.paths.configFile), env: {} }),
      runDoctor: async () => [{ id: 'test', title: 'Installation', status: 'ok', message: 'Ready' }],
      pendingHostSteps: async () => [],
      loginUrl: async () => '',
      openUrl: async () => undefined,
      now: () => new Date(),
    },
  }
  const ui = render(
    <WorkspaceApp deps={deps} showIntro={showIntro} color={false} write={terminal.stdout.write} />,
    {
      ...terminal.streams,
      debug: true,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  )
  cleanup.push(async () => {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
    try {
      // Unmount flushes an autosave; keep its real filesystem writes inside the fixture lifetime.
      await Promise.all(historyWrites.mock.results.map((result) => result.value))
    } finally {
      historyWrites.mockRestore()
    }
  })
  const sees = (text: string) => eventually(() => terminal.stdout.lastFrame().includes(text), text)
  return {
    terminal,
    finishEngine: () => finishEngine(),
    ui,
    attach,
    link,
    request,
    sees,
    press: (s: string) => terminal.stdin.press(s),
    click: async (label: string) => {
      await sees(label)
      const lines = terminal.stdout.lastFrame().split('\n'),
        y = lines.findIndex((line) => line.includes(label))
      const x = lines[y]!.indexOf(label)
      terminal.stdin.press(`\u001b[<0;${x + 1};${y + 1}M`)
    },
    paths: tmp.paths,
  }
}
describe('working terminal workspace', () => {
  it('keeps recent chats in message order when an older chat is clicked and saved', async () => {
    const t = mount()
    await t.sees('Agents & tools')
    expect(t.terminal.stdout.lastFrame()).not.toContain('Press any key')
    t.press('\u001b4')
    await t.sees('How can I help you today?')
    const history = new ChatHistory(dirname(t.paths.configFile))
    const older = history.create('http://localhost:1337/v1', 'local-model', '/project')
    older.title = 'Older chat'
    older.messages = [{ role: 'assistant', content: 'The earlier response' }]
    const recent = { ...history.create(older.endpoint, older.model, '/project'), title: 'Latest chat' }
    recent.messages = [{ role: 'assistant', content: 'The latest response' }]
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      await history.save(older)
      clock.mockReturnValue(2000)
      await history.save(recent)
    } finally {
      clock.mockRestore()
    }
    t.press('\u0010')
    await t.sees('Latest chat')
    t.terminal.stdout.resize(120, 36)
    t.press('\u0007')
    await t.sees('Go to')
    t.press('c')
    await t.sees('Recents')
    await t.click('Older chat')
    await t.sees('The earlier response')
    t.press('\u000e')
    await t.sees('Write a message')
    const frame = t.terminal.stdout.lastFrame()
    expect(frame.indexOf('Latest chat')).toBeLessThan(frame.indexOf('Older chat'))
    t.press('\u0010')
    await t.sees('Your conversations')
    expect((await history.list()).map((c) => [c.id, c.updatedAt])).toEqual([
      [recent.id, 2000],
      [older.id, 1000],
    ])
    t.press('\u0011')
    await t.ui.waitUntilExit()
  })
  it('opens Playground explicitly, selects a discovered model, edits and sends a message, then resizes', async () => {
    const t = mount()
    t.link.snapshotValue.server.running = true
    t.link.snapshotValue.sessions = [
      { model_id: 'local-model', provider: 'llamacpp-upstream', is_embedding: false },
    ] as never
    await t.sees('Agents & tools')
    await t.sees('local-model')
    expect(t.terminal.stdout.lastFrame()).not.toContain('Press any key')
    t.press('\u001b4')
    await t.sees('How can I help you today?')
    await t.click('Choose model ▾')
    await t.sees('local-model')
    await t.click('local-model')
    await t.sees('local-model ▾')
    t.press('Hello worl')
    t.press('d')
    t.press('\u001b[13;2u')
    t.press('Second line')
    t.press(KEYS.enter)
    await t.sees('A real streamed reply').catch((error: Error) => {
      throw new Error(`${error.message}\n${t.terminal.stdout.lastFrame()}`)
    })
    t.press('\u0010')
    await t.sees('Your conversations')
    await t.sees('Hello world')
    t.press('\t')
    t.press('\r')
    await t.sees('A real streamed reply')
    const posted = t.request.mock.calls.find((c) => String(c[0]).endsWith('/chat/completions'))
    expect(posted).toBeDefined()
    t.terminal.stdout.resize(180, 56)
    await t.sees('Recents')
    expect(t.attach.mock.calls.every((c) => !(c[0] as { launch?: boolean } | undefined)?.launch)).toBe(true)
    t.press('\u000e')
    await t.sees('Write a message')
    t.press('\u0011')
    await t.ui.waitUntilExit()
    expect(t.link.shutdowns).toBe(0)
    expect(posted?.[1]).toMatchObject({ body: expect.stringContaining('Hello world\\nSecond line') })
  })
  it('opens help through a global shortcut and supports mouse navigation after resize', async () => {
    const t = mount()
    await t.sees('Agents & tools')
    expect(t.terminal.stdout.lastFrame()).not.toContain('Press any key')
    t.press('\u001b4')
    await t.sees('How can I help you today?')
    t.press('\u0007')
    await t.sees('Go to')
    t.press('v')
    await t.click('Connections')
    await t.sees('Get started')
    t.press('\u000b')
    await t.sees('Keyboard shortcuts')
    t.press(KEYS.escape)
    t.terminal.stdout.resize(120, 36)
    await t.sees('Engine')
    await t.sees('Get started')
    await t.click('Models')
    await t.sees('Local models')
    t.press('\u0011')
    await t.ui.waitUntilExit()
  })
  it('opens a settings section with a single mouse press including coalesced motion and release reports', async () => {
    const t = mount(false, false)
    await t.sees('Agents & tools')
    t.terminal.stdout.resize(120, 36)
    t.press('\u001b3')
    await t.sees('General')
    const lines = t.terminal.stdout.lastFrame().split('\n'),
      y = lines.findIndex((line) => line.includes('Assistants')),
      x = lines[y]!.indexOf('Assistants')
    t.press(`\u001b[<35;${x + 1};${y + 1}M\u001b[<0;${x + 1};${y + 1}M\u001b[<0;${x + 1};${y + 1}m`)
    await t.sees('Add assistant')
    expect(t.terminal.stdout.lastFrame()).not.toContain('Check for updates')
    t.press('\u0011')
    await t.ui.waitUntilExit()
  })
  it('starts an engine in the background and keeps model choice interactive while it downloads', async () => {
    const hub = vi.spyOn(WorkspaceController.prototype, 'hub').mockResolvedValue([
      { id: 'local/first', title: 'First model', summary: '', downloads: 0 },
      { id: 'local/second', title: 'Second model', summary: '', downloads: 0 },
    ])
    cleanup.push(() => {
      hub.mockRestore()
    })
    const t = mount(true)
    expect(t.terminal.stdout.lastFrame()).not.toContain('Press any key')
    await t.sees('Choose engine')
    t.press(KEYS.enter)
    await t.sees('llama.cpp')
    t.press(KEYS.enter)
    await eventually(
      () => t.link.calls.some((call) => call.path === '/engines/llamacpp-upstream/update'),
      'engine installation'
    )
    const install = t.link.calls.find((call) => call.path === '/engines/llamacpp-upstream/update')!
    const taskId = (install.body as { task_id: string }).task_id
    t.link.emit({
      event: 'download:progress',
      data: { taskId, transferred: 70, total: 100, percent: 70 },
    } as never)
    await t.sees('Choose your first model')
    await vi.waitFor(() => expect(t.terminal.stdout.lastFrame()).toContain('70%'), { timeout: 4500 })
    expect(t.terminal.stdout.lastFrame()).not.toContain('Press any key')
    t.finishEngine()
    await t.sees('Continue')
    t.press(KEYS.down)
    t.press(KEYS.enter)
    await eventually(
      () => t.terminal.stdout.lastFrame().split('Second model').length === 2,
      'selected second model'
    )
    const reads = hub.mock.calls.length
    t.press(KEYS.escape)
    await t.sees('Press any key')
    t.press(' ')
    await t.sees('Choose your first model')
    await eventually(
      () => t.terminal.stdout.lastFrame().split('Second model').length === 2,
      'restored selected model'
    )
    expect(hub).toHaveBeenCalledTimes(reads)
    expect(t.link.calls.filter((call) => call.path === '/engines/llamacpp-upstream/update')).toHaveLength(1)
    t.press('\u0011')
    await t.ui.waitUntilExit()
  })
  it.each([true, false])(
    'closes open onboarding after the web finishes it (intro=%s)',
    async (intro) => {
      const t = mount(true, intro)
      await t.sees(intro ? 'Choose engine' : 'Choose your first model')
      await saveWorkspaceSetup(t.paths, 'manual')
      await vi.waitFor(() => expect(t.terminal.stdout.lastFrame()).toContain('Agents & tools'), {
        timeout: 4500,
      })
      expect(t.terminal.stdout.lastFrame()).not.toContain('Choose your first model')
      expect(t.terminal.stdout.lastFrame()).not.toContain('Press any key')
    },
    10000
  )
  it('reflects API start and stop from another client without leaving the current screen', async () => {
    const t = mount()
    t.terminal.stdout.resize(120, 36)
    await t.sees('Agents & tools')
    await t.sees('Start server')
    t.link.snapshotValue.server = { ...t.link.snapshotValue.server, running: true, port: 3210 }
    await vi.waitFor(() => expect(t.terminal.stdout.lastFrame()).toContain('Stop server'), { timeout: 4500 })
    expect(t.terminal.stdout.lastFrame()).toContain('Agents & tools')
    t.link.snapshotValue.server = { ...t.link.snapshotValue.server, running: false }
    await vi.waitFor(() => expect(t.terminal.stdout.lastFrame()).toContain('Start server'), { timeout: 4500 })
    expect(t.terminal.stdout.lastFrame()).toContain('Agents & tools')
  }, 12000)
})
