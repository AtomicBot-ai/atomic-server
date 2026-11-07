import { createElement } from 'react'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { render } from 'ink'
import { expect, it, vi } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { WorkspaceApp } from '../../src/tui/workspace/WorkspaceApp.js'
import { WorkspaceRuntime } from '../../src/tui/workspace/runtime/runtime.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it.each(['refused', 'empty', 'failure'])(
  'keeps a %s model check distinct at the terminal action reporting boundary',
  async (scenario) => {
    const tmp = tmpDataFolder(),
      terminal = fakeTerminal(120, 40),
      link = fakeCoreLink(),
      capture = vi.fn()
    readyWorkspace(tmp.paths.dataFolder)
    await writeFile(
      join(tmp.paths.atcDir, 'tui-catalog.json'),
      JSON.stringify({ libraryCategory: 'text', libraryFormat: 'safetensors' })
    )
    const execute = WorkspaceRuntime.prototype.execute
    const snapshot = vi.spyOn(WorkspaceRuntime.prototype, 'snapshot')
    const operations = vi.spyOn(WorkspaceRuntime.prototype, 'execute').mockImplementation(async function (
      this: WorkspaceRuntime,
      name,
      input
    ) {
      if (name === 'models.catalog')
        return {
          rows: [
            {
              id: 'fixture/model',
              name: 'Fixture model',
              category: 'text',
              source: { format: 'safetensors' },
            },
          ],
        }
      if (name === 'models.check') {
        if (scenario === 'failure') throw new Error('Fixture model check failed.')
        return {
          verdicts:
            scenario === 'empty'
              ? []
              : [
                  {
                    engine: 'vllm',
                    installed: false,
                    compatibility: null,
                    error: { code: 'MODEL_INCOMPATIBLE', message: 'Fixture model is incompatible.' },
                  },
                ],
        }
      }
      return execute.call(this, name, input)
    })
    const ui = render(
      createElement(WorkspaceApp, {
        initialPage: 'server',
        showIntro: false,
        color: false,
        write: terminal.stdout.write,
        deps: {
          request: async () => Response.json({ data: [] }),
          apiKey: '',
          chatKey: '',
          base: {
            errors: { capture },
            paths: tmp.paths,
            attach: async () => link,
            loadConfig: async () => resolveConfig({ env: {} }),
            runDoctor: async () => [],
            pendingHostSteps: async () => [],
            loginUrl: async () => '',
            openUrl: async () => {},
            now: () => new Date(),
          },
        },
      }),
      { ...terminal.streams, debug: true, interactive: true, exitOnCtrlC: false, patchConsole: false }
    )
    const sees = (text: string) =>
      eventually(() => terminal.stdout.lastFrame().includes(text), text).catch((error: Error) => {
        throw new Error(
          `${error.message}\n${terminal.stdout.lastFrame()}\n${JSON.stringify(capture.mock.calls)}`
        )
      })
    const click = async (label: string) => {
      const matches = (line: string) =>
        label === 'Download' ? line.trimEnd().endsWith(label) : line.includes(label)
      await eventually(() => terminal.stdout.lastFrame().split('\n').some(matches), label)
      const lines = terminal.stdout.lastFrame().split('\n'),
        y = lines.findLastIndex(matches),
        x = lines[y]!.lastIndexOf(label)
      terminal.stdin.press(`\u001b[<0;${x + 1};${y + 1}M`)
    }
    try {
      await vi.waitFor(() => expect(snapshot).toHaveBeenCalled())
      await snapshot.mock.results[0]?.value
      await sees('Agents & tools')
      terminal.stdin.press('\u001b3')
      await click('Fixture model')
      await click('Download')
      await sees(
        scenario === 'failure'
          ? 'Fixture model check failed.'
          : scenario === 'empty'
            ? 'No GGUF file found, and no managed engine takes this model.'
            : 'Fixture model is incompatible.'
      )
      expect(operations.mock.calls.filter(([name]) => name === 'models.check')).toHaveLength(1)
      expect(
        operations.mock.calls.some(([name]) => name === 'managed.plan' || name === 'managed.install')
      ).toBe(false)
      if (scenario === 'failure')
        expect(capture).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            tags: expect.objectContaining({ component: 'tui', operation: 'workspace.action' }),
          })
        )
      else expect(capture).not.toHaveBeenCalled()
    } finally {
      ui.unmount()
      await ui.waitUntilExit()
      operations.mockRestore()
      snapshot.mockRestore()
      tmp.cleanup()
    }
  }
)
