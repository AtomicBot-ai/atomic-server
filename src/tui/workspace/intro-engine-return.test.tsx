import { render } from 'ink'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { fakeTerminal, eventually } from '../../../test/helpers/fake-terminal.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { plan } from '../../../test/helpers/managed-fixtures.js'
import { resolveConfig } from '../../config/index.js'
import { TerminalSetup, EngineSelection } from '../../terminal-setup/index.js'
import { WorkspaceApp } from './WorkspaceApp.js'
import { WorkspaceController } from './controller.js'
import { WorkspaceRuntime } from './runtime/runtime.js'

it.each(['Escape', 'Close'])(
  'returns from blocked SGLang via %s and continues with a different engine',
  async (back) => {
    const tmp = tmpDataFolder(),
      terminal = fakeTerminal(100, 40),
      link = fakeCoreLink()
    vi.spyOn(TerminalSetup.prototype, 'catalogs').mockResolvedValue([])
    vi.spyOn(TerminalSetup.prototype, 'engines').mockResolvedValue(['sglang', 'mlx'])
    vi.spyOn(TerminalSetup.prototype, 'installed').mockResolvedValue([])
    vi.spyOn(EngineSelection.prototype, 'list').mockResolvedValue([
      { id: 'sglang', provider: 'sglang', version: 'v1', backend: 'cuda', installed: false },
      { id: 'mlx', provider: 'mlx', version: 'v1', backend: 'metal', installed: true },
    ])
    vi.spyOn(WorkspaceController.prototype, 'installed').mockResolvedValue([])
    const hub = vi
      .spyOn(WorkspaceController.prototype, 'hub')
      .mockResolvedValue([{ id: 'mlx-community/good', title: 'Model for the new engine', downloads: 0 }])
    vi.spyOn(WorkspaceRuntime.prototype, 'start').mockResolvedValue({ launch: 'terminal' } as never)
    const execute = vi.spyOn(WorkspaceRuntime.prototype, 'execute').mockImplementation(async (name) => {
      if (name === 'engines.plan')
        return {
          engine: 'sglang',
          environment_id: 'default',
          executor: 'linux-docker',
          plan: plan('sglang', {
            availability: 'prerequisite-blocked',
            blockers: [{ code: 'MANAGED_PREREQUISITE_BLOCKED', message: 'No NVIDIA GPU available.' }],
          }),
          plan_error: null,
          notices: [],
          installation: null,
          operation: null,
          other_operation: null,
          failed: null,
          models_kept_for: [],
          update: null,
        }
      return {}
    })
    const config = resolveConfig({ env: {}, flags: { 'tui.motion': false } })
    const ui = render(
      <WorkspaceApp
        color={false}
        write={terminal.stdout.write}
        deps={{
          request: async () => Response.json({}),
          apiKey: '',
          chatKey: '',
          base: {
            paths: tmp.paths,
            attach: async () => link,
            loadConfig: async () => config,
            runDoctor: async () => [],
            pendingHostSteps: async () => [],
            loginUrl: async () => '',
            openUrl: async () => {},
            now: () => new Date(),
          },
        }}
      />,
      { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
    )
    const sees = (text: string) => eventually(() => terminal.stdout.lastFrame().includes(text), text)
    const press = async (key: string) => act(async () => terminal.stdin.press(key))
    try {
      await sees('Choose engine')
      await press('\r')
      await sees('Choose your engine')
      await press('\r')
      await sees('No NVIDIA GPU available.')
      if (back === 'Escape') await press('\u001b')
      else {
        const lines = terminal.stdout.lastFrame().split('\n')
        const y = lines.findIndex((line) => line.includes('Close'))
        expect(y).toBeGreaterThan(-1)
        const x = lines[y]!.indexOf('Close')
        await press(`\u001b[<0;${x + 1};${y + 1}M`)
      }
      await sees('Choose your engine')
      expect(terminal.stdout.lastFrame()).not.toContain('Model setup')
      await press('\u001b[B')
      await press('\r')
      await sees('Press any key')
      await press('x')
      await sees('Model for the new engine')
      expect(hub).toHaveBeenLastCalledWith('', expect.any(AbortSignal), expect.any(Function), 'mlx')
      expect(execute.mock.calls.filter(([name]) => name === 'engines.plan')).toHaveLength(1)
      expect(execute.mock.calls.some(([name]) => ['engines.operate', 'engines.enqueue'].includes(name))).toBe(
        false
      )
    } finally {
      await act(async () => ui.unmount())
      await ui.waitUntilExit()
      vi.restoreAllMocks()
      tmp.cleanup()
    }
  }
)
