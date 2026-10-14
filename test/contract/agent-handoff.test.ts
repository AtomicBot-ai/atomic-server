import { readyWorkspace } from '../helpers/ready-workspace.js'
import { expect, it } from 'vitest'
import { runTui } from '../../src/tui/index.js'
import { ROOT } from '../../src/commands/index.js'
import { readTextFile, resolveConfig } from '../../src/config/index.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { createWorkspace } from '../../src/tui/workspace/state.js'
import { workspaceFrame } from '../../src/tui/workspace/frame.js'
it('releases mouse capture before handing off and returns to Server without stopping the API', async () => {
  const tmp = tmpDataFolder(),
    terminal = fakeTerminal(100, 30),
    link = fakeCoreLink()
  readyWorkspace(tmp.paths.dataFolder)
  link.snapshotValue.server.running = true
  let launched = false
  const promise = runTui({
    terminal: terminal.streams,
    screen: 'server',
    root: ROOT,
    color: false,
    dataFolder: tmp.paths.dataFolder,
    waitForShutdown: () => new Promise(() => undefined),
    request: (async () => Response.json({ data: [{ id: 'test-model' }] })) as typeof fetch,
    agentHost: {
      folder: tmp.paths.dataFolder,
      cwd: tmp.paths.dataFolder,
      env: {},
      find: () => '/fake/atag',
      exec: async () => ({ code: 0, stdout: '0.6.6', stderr: '', timedOut: false }),
    },
    launchAgent: async (launch) => {
      expect(terminal.stdout.writes.join('')).toContain('\u001b[?1006l')
      expect(launch.command).toBe('/fake/atag')
      expect(launch.env['ATOMIC_AGENT_STATE_DIR']).toContain(tmp.paths.dataFolder)
      launched = true
    },
    deps: {
      paths: tmp.paths,
      attach: async () => link,
      loadConfig: async () => resolveConfig({ fileText: await readTextFile(tmp.paths.configFile), env: {} }),
      runDoctor: async () => [],
      pendingHostSteps: async () => [],
      loginUrl: async () => '',
      openUrl: async () => undefined,
      now: () => new Date(),
    },
  })
  try {
    await eventually(() => terminal.stdout.text().includes('Copy address'))
    const target = workspaceFrame(createWorkspace('server'), 100, 30, 0).targets.find(
      (t) => t.id === 'agent:atomic-agent'
    )!
    terminal.stdin.press(`\u001b[<0;${target.x + 1};${target.y + 1}M`)
    await eventually(() => terminal.stdout.text().includes('Launch and switch'))
    terminal.stdin.press('\r')
    await eventually(() => launched)
    await eventually(() => terminal.stdout.text().includes('Back in Server.'))
    terminal.stdin.press('\u0011')
    expect(await promise).toBe(0)
    expect(link.shutdowns).toBe(0)
  } finally {
    terminal.stdin.press('\u0011')
    await promise
    tmp.cleanup()
  }
})
