/** A real Ink screen and workspace service: a second client wins immediately before Send. */
import { createElement } from 'react'
import { render } from 'ink'
import { expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { hostedWorkspace } from '../helpers/hosted-workspace.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'
import { ChatHistory } from '../../src/terminal-data/index.js'
import { readTextFile, resolveConfig } from '../../src/config/index.js'
import { WorkspaceApp } from '../../src/tui/workspace/WorkspaceApp.js'
import type { WorkspaceDeps } from '../../src/tui/workspace/controller.js'

it('reopens a refused stale chat with its draft, starts a new chat and quits without replacing newer history', async () => {
  const temp = tmpDataFolder(),
    terminal = fakeTerminal(120, 36),
    link = fakeCoreLink(),
    history = new ChatHistory(temp.paths.atcDir)
  readyWorkspace(temp.paths.dataFolder)
  link.snapshotValue.server.running = true
  link.snapshotValue.sessions = [
    { model_id: 'fixture-model', provider: 'llamacpp-upstream', is_embedding: false },
  ] as never
  const chat = history.create('', 'fixture-model', '')
  chat.title = 'Shared fixture chat'
  chat.messages = [{ role: 'assistant', content: 'Original reply' }]
  await history.save(chat, 0)
  const newer = {
    ...chat,
    messages: [...chat.messages, { role: 'assistant' as const, content: 'Saved by another client' }],
  }
  const inference = vi.fn(
    async (_url: unknown, _init?: RequestInit) => new Response('unexpected inference', { status: 500 })
  )
  const transport = hostedWorkspace(temp.paths, link, (async (url, init) =>
    String(url).endsWith('/models')
      ? Response.json({ data: [{ id: 'fixture-model' }] })
      : inference(url, init)) as typeof fetch)
  let refused = false,
    snapshots = 0
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/api/workspace/execute')) {
      const { operation } = JSON.parse(String(init?.body)) as { operation: string }
      if (operation === 'chat.start' && !refused) {
        await history.save(newer, chat.revision)
        refused = true
      }
    }
    const response = await transport(url, init)
    if (String(url).endsWith('/api/workspace')) snapshots++
    return response
  }
  const deps: WorkspaceDeps = {
    apiKey: '',
    chatKey: '',
    request,
    base: {
      paths: temp.paths,
      attach: async () => link,
      loadConfig: async () => resolveConfig({ fileText: await readTextFile(temp.paths.configFile), env: {} }),
      runDoctor: async () => [],
      pendingHostSteps: async () => [],
      loginUrl: async () => '',
      openUrl: async () => {},
      now: () => new Date(),
    },
  }
  const writes = vi.spyOn(ChatHistory.prototype, 'save')
  const ui = render(
    createElement(WorkspaceApp, {
      deps,
      showIntro: false,
      initialPage: 'chat',
      color: false,
      write: terminal.stdout.write,
    }),
    { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
  )
  const sees = async (text: string) => {
    await eventually(() => terminal.stdout.lastFrame().includes(text), text).catch((error: Error) => {
      throw new Error(`${error.message}\n${terminal.stdout.lastFrame()}`)
    })
  }
  const click = async (label: string) => {
    await sees(label)
    const lines = terminal.stdout.lastFrame().split('\n'),
      y = lines.findIndex((line) => line.includes(label)),
      x = lines[y]!.indexOf(label)
    terminal.stdin.press(`\u001b[<0;${x + 1};${y + 1}M`)
  }
  try {
    await click(chat.title)
    await sees('Original reply')
    await vi.waitFor(() => expect(snapshots).toBeGreaterThan(0), { timeout: 4500 })
    terminal.stdin.press('Keep this draft')
    terminal.stdin.press('\r')
    await sees('Reopen it before retrying')
    expect(refused).toBe(true)
    await sees('Keep this draft')
    await click(chat.title)
    await sees('Saved by another client')
    await sees('Keep this draft')
    terminal.stdin.press('\u000e')
    await sees('Write a message')
    terminal.stdin.press('\u0011')
    await ui.waitUntilExit()
    expect(await history.load(chat.id)).toEqual(newer)
    expect(inference).not.toHaveBeenCalled()
  } finally {
    ui.unmount()
    await Promise.allSettled(writes.mock.results.map((result) => result.value))
    writes.mockRestore()
    temp.cleanup()
  }
})
