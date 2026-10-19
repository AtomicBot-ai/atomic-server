import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { coreOperation } from './core-operations.js'
import { ensureArtifactEngine, installEngine } from './engine-install.js'

/** `POST /engines/versions` as the core answers it for one engine. */
function versions(engine: EngineId, over: Record<string, unknown> = {}) {
  return {
    engines: [{ engine, kind: ENGINE_KINDS[engine], builds: [], active: null, latest: null, ...over }],
  }
}

describe('installEngine', () => {
  it('installs the build the core names as latest', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('llamacpp-upstream', {
      latest: { version: 'b100', variant: 'metal' },
    })
    await installEngine(link, 'llamacpp-upstream')
    expect(link.calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/engines/llamacpp-upstream/update',
      body: { target: { version: 'b100', variant: 'metal' } },
    })
    expect(link.calls.some((c) => c.path.endsWith('/catalog'))).toBe(false)
  })

  it('installs nothing when the core offers no build', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('llamacpp-upstream')
    await expect(installEngine(link, 'llamacpp-upstream')).rejects.toThrow('No compatible engine build')
    expect(link.calls.some((c) => c.path.endsWith('/update'))).toBe(false)
  })

  it('treats every managed engine the core lists as managed, sglang included', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('sglang')
    await expect(installEngine(link, 'sglang')).rejects.toThrow('environments.probe')
  })
})

describe('ensureArtifactEngine', () => {
  // A load runs on the configured build or, without one, the best compatible build on disk (core
  // `ensureBackend`): any build on disk is enough, and nothing is downloaded.
  it('leaves a llama.cpp engine with a build on disk alone', async () => {
    const link = fakeCoreLink()
    link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', backend: 'cpu' }] }
    await ensureArtifactEngine(link, 'llamacpp-upstream', 'task')
    expect(link.calls.some((c) => c.path.endsWith('/update'))).toBe(false)
  })

  it('installs the latest build when none is on disk', async () => {
    const link = fakeCoreLink()
    link.responses['GET /backends/llamacpp-upstream'] = { backends: [] }
    link.responses['POST /engines/versions'] = versions('llamacpp-upstream', {
      latest: { version: 'b2', variant: 'cpu' },
    })
    await ensureArtifactEngine(link, 'llamacpp-upstream', 'task')
    expect(link.calls.at(-1)).toMatchObject({
      path: '/engines/llamacpp-upstream/update',
      body: { task_id: 'task', target: { version: 'b2', variant: 'cpu' } },
    })
  })
})

describe('engines.catalog', () => {
  it('answers a managed engine with its environments, sglang included', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('sglang')
    await coreOperation(link, 'engines.catalog', { engine: 'sglang' })
    expect(link.calls.some((c) => c.path === '/backends/sglang/catalog')).toBe(false)
  })
})

describe('settings.update', () => {
  it('refuses version_backend: a build is made active through engines.activate', async () => {
    const link = fakeCoreLink()
    await expect(
      coreOperation(link, 'settings.update', {
        provider: 'llamacpp-upstream',
        values: { version_backend: 'b2/cpu', ctx_size: 4096 },
      })
    ).rejects.toThrow('engines.activate')
    expect(link.calls).toEqual([])
  })
})
