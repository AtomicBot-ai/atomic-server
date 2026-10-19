import { createElement } from 'react'
import { render } from 'ink'
import { expect, it } from 'vitest'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { fakeTerminal, eventually } from '../helpers/fake-terminal.js'
import { waitFor } from '../helpers/wait-for.js'
import { WorkspaceApp } from '../../src/tui/workspace/WorkspaceApp.js'
import type { WorkspaceDeps } from '../../src/tui/workspace/controller.js'
import { createWorkspace } from '../../src/tui/workspace/state.js'
import { workspaceFrame } from '../../src/tui/workspace/frame.js'
import { readTextFile, resolveConfig } from '../../src/config/index.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { defaultConfig } from '../../src/config/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
const weights = Buffer.alloc(1000, 5)
const ADMIN = 'http://127.0.0.1:15555'
it('walks first-run setup with mouse and keyboard, gates access, and resumes the download after a server restart', async () => {
  const temp = tmpDataFolder(),
    terminal = fakeTerminal(120, 36),
    link = fakeCoreLink()
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
    if (path === '/models/atomic-prism/families') return { families: [] } as T
    if (path === '/models/compatibility')
      return { outcome: 'compatible', provider: null, requires: [], reason: 'stock' } as T
    if (path === '/backends/llamacpp-upstream')
      return { backends: engine ? [{ version: 'b1', backend: 'cpu' }] : [] } as T
    if (path.endsWith('/install')) {
      engine = true
      return {} as T
    }
    return {} as T
  }
  // The Hub: the first request for the weights stops halfway and never finishes, like a server that died.
  const ranges: string[] = []
  let weightRequests = 0
  const stalled = new AbortController()
  const hub = (async (url: unknown, init?: RequestInit) => {
    const href = String(url)
    if (href.includes('staff-picks.json'))
      return Response.json({ picks: [{ model_name: 'fixture/repo', title: 'Fixture', order: 0 }] })
    if (href.includes('/api/models?')) return Response.json([{ id: 'fixture/repo', downloads: 1 }])
    if (href.includes('/resolve/')) {
      const range = new Headers(init?.headers).get('range')
      if (range) ranges.push(range)
      const start = Number(/bytes=(\d+)-/.exec(range ?? '')?.[1] ?? 0)
      const first = weightRequests++ === 0
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(weights.subarray(start, first ? 500 : weights.length)))
          if (first) stalled.signal.addEventListener('abort', () => controller.error(new Error('gone')))
          else controller.close()
        },
      })
      return new Response(body, {
        status: range ? 206 : 200,
        headers: {
          'content-length': String(weights.length - start),
          ...(range ? { 'content-range': `bytes ${start}-${weights.length - 1}/${weights.length}` } : {}),
        },
      })
    }
    return Response.json({ siblings: [{ rfilename: 'model.Q4_K_M.gguf', size: weights.length }] })
  }) as typeof fetch
  // The server: its workspace runs the setups; the terminal reaches it through the admin listener.
  const daemon = () =>
    new WorkspaceService({ link, paths: temp.paths, config: defaultConfig(), fetch: hub, env: {} })
  let server = daemon()
  await mkdir(temp.paths.runDir, { recursive: true })
  await writeFile(
    temp.paths.daemonRecord,
    JSON.stringify({ schema_version: 1, instance_id: link.endpoint.instanceId, pid: 4242, admin_url: ADMIN })
  )
  await writeFile(temp.paths.adminToken, 'admin-token')
  const admin = async (url: string, init?: RequestInit) => {
    try {
      if (url.endsWith('/api/workspace')) return Response.json(await server.snapshot())
      const { operation, input } = JSON.parse(String(init?.body)) as {
        operation: string
        input: Record<string, unknown>
      }
      return Response.json((await server.execute(operation, input)) ?? null)
    } catch (e) {
      return Response.json({ error: { code: 'ATC_USAGE', message: (e as Error).message } }, { status: 400 })
    }
  }
  const setups = async () =>
    ((await server.execute('setup.status')) as { setups: { stage: string }[] }).setups
  const load = link.models.load
  link.models.load = async (provider, model) => {
    const result = await load(provider, model)
    link.snapshotValue.sessions = [{ ...result, provider, state: 'ready' } as never]
    return result
  }
  const start = link.server.start
  link.server.start = async (body) => {
    const result = await start(body)
    link.snapshotValue.server = result
    return result
  }
  const deps: WorkspaceDeps = {
    apiKey: '',
    chatKey: '',
    request: (async (url: unknown, init?: RequestInit) =>
      String(url).startsWith(ADMIN) ? admin(String(url), init) : hub(url as string, init)) as typeof fetch,
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
    await sees('SET UP SERVER')
    click('hosting')
    // A goal comes first; the text goals continue into the engine-first setup.
    await sees('What will you use it for?')
    terminal.stdin.press('\r')
    await sees('Choose models >')
    terminal.stdin.press('\r')
    await sees('fixture/repo')
    // The first curated model has focus; searching is optional. Its plan is reviewed before downloading.
    terminal.stdin.press('\r')
    await sees('Review before downloading')
    terminal.stdin.press('\r')
    await sees('BUILDING YOUR LOCAL WORKSPACE')
    terminal.stdin.press('\u0007')
    terminal.stdin.press('c')
    await sees('Prepare your workspace first')
    expect(link.calls.some((c) => c.path.endsWith('/load'))).toBe(false)
    await waitFor(async () => (await setups()).length === 1)
    await eventually(() => ranges.length === 0 && weightRequests === 1, 'first half downloading')
    ui.unmount()
    // The server restarts mid-download: its record is left behind, the partial file stays.
    server = daemon()
    expect((await setups())[0]?.stage).toBe('interrupted')
    ui = mount()
    await sees('Copy address')
    expect(ranges).toEqual(['bytes=500-'])
    expect(link.calls.some((c) => c.path === '/models/llamacpp-upstream/fixture/model.Q4_K_M/load')).toBe(
      true
    )
    expect(link.calls.some((c) => /model-setups|setup-plan/.test(c.path))).toBe(false)
    expect(link.calls.some((c) => c.path === '/server/start')).toBe(true)
    terminal.stdin.press('\u0011')
    await ui.waitUntilExit()
  } finally {
    stalled.abort()
    ui.unmount()
    temp.cleanup()
  }
})
