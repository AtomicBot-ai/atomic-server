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
  cleanup.push(tmp.cleanup)
  const request = vi.fn(async (url: unknown) =>
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
    paths: tmp.paths,
  }
}
describe('working terminal workspace', () => {
  it('chooses personal mode, selects a discovered model, edits and sends a message, then resizes', async () => {
    const t = mount()
    await t.sees('How will you use Atomic Chat?')
    t.press('1')
    await t.sees('Your next idea starts here.')
    t.press('\u0007')
    t.press('m')
    await t.sees('local-model')
    // The model row is a mouse target at x=2,y=11 in the compact layout.
    t.press('\u001b[<0;4;12M')
    await t.sees('Model: local-model')
    t.press('Hello worl')
    t.press('d')
    t.press(KEYS.enter)
    await t.sees('A real streamed reply')
    const posted = t.request.mock.calls.find((c) => String(c[0]).endsWith('/chat/completions'))
    expect(posted).toBeDefined()
    t.terminal.stdout.resize(180, 56)
    await t.sees('THIS CHAT')
    expect(t.attach.mock.calls.every((c) => !(c[0] as { launch?: boolean } | undefined)?.launch)).toBe(true)
    t.press('\u000e')
    await t.sees('What would you like to explore?')
    t.press('\u0011')
    await t.ui.waitUntilExit()
    expect(t.link.shutdowns).toBe(0)
    expect(await readTextFile(t.paths.configFile)).toContain('personal')
  })
  it('opens help through a global shortcut and supports mouse navigation after resize', async () => {
    const t = mount()
    await t.sees('How will you use Atomic Chat?')
    t.press('2')
    await t.sees('Bring your API online')
    t.press('\u000b')
    await t.sees('A few keys, anywhere')
    t.press(KEYS.escape)
    t.terminal.stdout.resize(120, 36)
    await t.sees('Bring your API online')
    // The standard header is on row 8; Settings begins at column 31.
    t.press('\u001b[<0;34;8M')
    await t.sees('Make yourself at home')
    t.press('\u0011')
    await t.ui.waitUntilExit()
  })
})
