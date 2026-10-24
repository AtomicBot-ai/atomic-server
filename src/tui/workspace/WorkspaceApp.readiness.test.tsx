import { render } from 'ink'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { readyWorkspace } from '../../../test/helpers/ready-workspace.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../../../test/helpers/fake-terminal.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { resolveConfig } from '../../config/index.js'
import { ChatHistory } from '../../terminal-data/index.js'
import { WorkspaceApp } from './WorkspaceApp.js'
import { WorkspaceController } from './controller.js'
import { WorkspaceRuntime } from './runtime.js'

it.each(['mouse', 'keyboard'])(
  'blocks an empty-model %s Send before any request, conversation, or draft clearing',
  async (input) => {
    const tmp = tmpDataFolder(),
      terminal = fakeTerminal(90, 32),
      link = fakeCoreLink()
    readyWorkspace(tmp.paths.dataFolder)
    const config = resolveConfig({ flags: { 'api.port': 63163 }, env: {} })
    const request = vi.fn<typeof fetch>(async () => Response.json({ data: [] }))
    const chat = vi.spyOn(WorkspaceController.prototype, 'chat')
    const snapshot = vi.spyOn(WorkspaceRuntime.prototype, 'snapshot')
    const history = new ChatHistory(tmp.paths.atcDir)
    const ui = render(
      <WorkspaceApp
        initialPage="chat"
        showIntro={false}
        color={false}
        write={terminal.stdout.write}
        deps={{
          request,
          apiKey: '',
          chatKey: '',
          base: {
            paths: tmp.paths,
            attach: async () => link,
            loadConfig: async () => config,
            runDoctor: async () => [],
            pendingHostSteps: async () => [],
            loginUrl: async () => '',
            openUrl: async () => undefined,
            now: () => new Date(),
          },
        }}
      />,
      { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
    )
    try {
      await eventually(() => terminal.stdout.lastFrame().includes('How can I help you today?'))
      await vi.waitFor(async () =>
        expect(await snapshot.mock.results[0]?.value).toMatchObject({ api: { port: 63163 } })
      )
      terminal.stdin.press('Keep this draft')
      await eventually(() => terminal.stdout.lastFrame().includes('Keep this draft'))
      if (input === 'keyboard') terminal.stdin.press('\r')
      else {
        const lines = terminal.stdout.lastFrame().split('\n'),
          y = lines.findIndex((line) => line.includes('Send ↑'))
        expect(y).toBeGreaterThan(-1)
        const x = lines[y]!.indexOf('Send ↑')
        terminal.stdin.press(`\u001b[<0;${x + 1};${y + 1}M`)
      }
      await vi.waitFor(() =>
        expect(terminal.stdout.lastFrame()).toMatch(/Choose(?: and download)? a model to continue\./)
      )
      expect(chat).not.toHaveBeenCalled()
      expect(request.mock.calls.some(([url]) => String(url).includes('/chat/completions'))).toBe(false)
      expect(await history.list()).toEqual([])
      expect(terminal.stdout.text()).not.toContain('No text returned')
      terminal.stdin.press('\u001b4')
      await eventually(() => terminal.stdout.lastFrame().includes('Keep this draft'))
      expect(terminal.stdout.lastFrame()).toContain('Send ↑')
    } finally {
      await act(async () => ui.unmount())
      await ui.waitUntilExit()
      chat.mockRestore()
      snapshot.mockRestore()
      tmp.cleanup()
    }
  }
)
