import { createElement } from 'react'
import { render } from 'ink'
import { expect, it } from 'vitest'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { WorkspaceApp } from '../../src/tui/workspace/WorkspaceApp.js'
import type { WorkspaceDeps } from '../../src/tui/workspace/controller.js'
import { createWorkspace } from '../../src/tui/workspace/state.js'
import { workspaceFrame } from '../../src/tui/workspace/frame.js'
import { readTextFile, resolveConfig } from '../../src/config/index.js'
import type { ModelSetup, ModelSetupPlan } from '../../src/terminal-setup/index.js'
const plan: ModelSetupPlan = {
  digest: 'pinned-plan',
  model_id: 'fixture/model',
  provider: 'llamacpp-upstream',
  verdict: { status: 'supported' } as never,
  engine: null,
  model: { repo: 'fixture/repo', file: 'model.Q4_K_M.gguf', revision: 'pinned', size: 1000 },
  projector: null,
  total_download_bytes: 1000,
  free_bytes: 1024 ** 4,
  blockers: [],
}
it('walks first-run setup with mouse and keyboard, gates access, and recovers background installation', async () => {
  const temp = tmpDataFolder(),
    terminal = fakeTerminal(120, 36),
    link = fakeCoreLink()
  const jobs: ModelSetup[] = []
  let engine = false
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    if (path.endsWith('/catalog'))
      return {
        provider: path.split('/')[2],
        available: [{ version: 'b1', backend: 'cpu' }],
        recommended: 'b1/cpu',
        source: 'live',
      } as T
    if (path === '/models/setup-plan') return plan as T
    if (path === '/backends/llamacpp-upstream')
      return { backends: engine ? [{ version: 'b1', backend: 'cpu' }] : [] } as T
    if (path.endsWith('/install')) {
      engine = true
      return {} as T
    }
    if (path === '/model-setups' && method === 'POST') {
      const row = {
        setup_id: 'setup-1',
        request_id: (body as { request_id: string }).request_id,
        stage: 'downloading_model',
        plan,
        task_ids: { model: 'download-1' },
      } as ModelSetup
      jobs.push(row)
      return row as T
    }
    if (path === '/model-setups') return { setups: jobs } as T
    return {} as T
  }
  const deps: WorkspaceDeps = {
    apiKey: '',
    chatKey: '',
    request: (async (url: unknown) =>
      String(url).includes('staff-picks.json')
        ? Response.json({ picks: [{ model_name: 'fixture/repo', title: 'Fixture', order: 0 }] })
        : String(url).includes('/api/models?')
          ? Response.json([{ id: 'fixture/repo', downloads: 1 }])
          : Response.json({ siblings: [{ rfilename: 'model.Q4_K_M.gguf', size: 1000 }] })) as typeof fetch,
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
  const mount = () =>
    render(createElement(WorkspaceApp, { deps, color: false, write: terminal.stdout.write }), {
      ...terminal.streams,
      debug: true,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
  let ui = mount()
  const sees = (text: string) => eventually(() => terminal.stdout.lastFrame().includes(text), text)
  const click = (id: string, state = createWorkspace('welcome')) => {
    const t = workspaceFrame(state, 120, 36, 0).targets.find((t) => t.id === id)!
    terminal.stdin.press(`\u001b[<0;${t.x + 2};${t.y + 2}M`)
  }
  try {
    await sees('Choose your workspace')
    click('hosting')
    await sees('Choose models >')
    terminal.stdin.press('\r')
    await sees('fixture/repo')
    // The first curated model has focus; searching is optional.
    terminal.stdin.press('\r')
    await sees('model.Q4_K_M.gguf')
    terminal.stdin.press('\r')
    await sees('BUILDING YOUR LOCAL WORKSPACE')
    terminal.stdin.press('\u0007')
    terminal.stdin.press('c')
    await sees('Prepare your workspace first')
    expect(link.calls.some((c) => c.path.endsWith('/load'))).toBe(false)
    await eventually(() => jobs.length === 1, 'background job accepted')
    ui.unmount()
    jobs[0]!.stage = 'ready'
    ui = mount()
    await sees('THE GATES ARE READY')
    terminal.stdin.press('\r')
    await sees('YOUR SERVER IS READY TO START')
    expect(link.calls.some((c) => c.path === '/models/llamacpp-upstream/fixture/model/load')).toBe(true)
    expect(link.calls.some((c) => c.path === '/server/start')).toBe(false)
    terminal.stdin.press('\r')
    await eventually(() => link.calls.some((c) => c.path === '/server/start'), 'explicit server launch')
    terminal.stdin.press('\u0011')
    await ui.waitUntilExit()
  } finally {
    ui.unmount()
    temp.cleanup()
  }
})
