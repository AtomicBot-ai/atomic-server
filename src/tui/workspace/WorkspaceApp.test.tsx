import { readyWorkspace } from '../../../test/helpers/ready-workspace.js'
import { dirname } from 'node:path'
import { ChatHistory } from '../../terminal-data/index.js'
import { render } from 'ink'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { fakeTerminal, eventually, KEYS } from '../../../test/helpers/fake-terminal.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { readTextFile, resolveConfig } from '../../config/index.js'
import { WorkspaceApp } from './WorkspaceApp.js'
import type { WorkspaceDeps } from './controller.js'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f())
})
function mount() {
  const tmp = tmpDataFolder(),
    terminal = fakeTerminal(80, 24),
    link = fakeCoreLink(),
    attach = vi.fn(async (_options: { launch: boolean }) => link)
  readyWorkspace(tmp.paths.dataFolder)
  cleanup.push(tmp.cleanup)
  const request = vi.fn(async (url: unknown, _init?: RequestInit) =>
    String(url).endsWith('/models')
      ? Response.json({ data: [{ id: 'local-model' }] })
      : new Response('data: {"choices":[{"delta":{"content":"A real streamed reply"}}]}\n\ndata: [DONE]\n\n')
  )
  const deps: WorkspaceDeps = {
    request: request as typeof fetch,
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
  const ui = render(<WorkspaceApp deps={deps} color={false} write={terminal.stdout.write} />, {
    ...terminal.streams,
    debug: true,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  cleanup.push(() => ui.unmount())
  const sees = (text: string) => eventually(() => terminal.stdout.lastFrame().includes(text), text)
  return {
    terminal,
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
    await t.sees('Choose a model below')
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
  it('chooses personal mode, selects a discovered model, edits and sends a message, then resizes', async () => {
    const t = mount()
    await t.sees('Choose a model below')
    t.press('\u0007')
    t.press('m')
    await t.sees('local-model')
    await t.click('● local-model')
    await t.sees('Model: local-model')
    t.press('Hello worl')
    t.press('d')
    t.press('\u001b[13;2u')
    t.press('Second line')
    t.press(KEYS.enter)
    await t.sees('A real streamed reply')
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
    await t.sees('Choose a model below')
    t.press('\u0007')
    t.press('s')
    await t.sees('Copy address')
    t.press('\u000b')
    await t.sees('Keyboard shortcuts')
    t.press(KEYS.escape)
    t.terminal.stdout.resize(120, 36)
    await t.sees('Copy address')
    await t.click('Engines & Models')
    await t.sees('Installed')
    t.press('\u0011')
    await t.ui.waitUntilExit()
  })
})
