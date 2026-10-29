import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineId } from '@atomic-chat/core/contracts'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { DIGEST_A, plan } from '../../../test/helpers/managed-fixtures.js'
import { coreOperation } from '../core-operations.js'
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
})

describe('installEngine, engines of builds', () => {
  it('installs an engine the core offers here', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('litert-lm')
    await installEngine(link, 'litert-lm')
    expect(link.calls.at(-1)).toMatchObject({ method: 'POST', path: '/engines/litert-lm/update' })
  })

  it('says an engine the core does not offer here is not available on this platform, and begins nothing', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('mlx')
    await expect(installEngine(link, 'litert-lm')).rejects.toThrow(
      'LiteRT-LM is not available on this platform: the core does not offer it here.'
    )
    expect(link.calls.some((c) => c.path.endsWith('/update'))).toBe(false)
  })
})

describe('installEngine, managed engines', () => {
  it('answers the plan of an engine that is not installed, sglang included, and begins nothing', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('sglang')
    link.responses['POST /environments/probe'] = plan('sglang')
    const result = await installEngine(link, 'sglang')
    expect(result).toMatchObject({
      engine: 'sglang',
      status: 'plan',
      state: { plan: { plan_digest: DIGEST_A }, installation: null },
    })
    expect(link.calls.some((c) => c.path.endsWith('/update') || c.path.endsWith('/operations'))).toBe(false)
  })

  it('offers the update of an installed engine with the new release’s plan, and begins nothing', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('vllm', {
      active: { version: 'vllm-2026.10.1', variant: 'linux/amd64' },
      update: {
        needed: true,
        target: { version: 'vllm-2026.11.1', variant: 'linux/amd64' },
        apply: 'reinstall',
      },
    })
    const result = await installEngine(link, 'vllm', { request_id: 'r-9' })
    expect(result).toMatchObject({
      engine: 'vllm',
      status: 'update',
      from: 'vllm-2026.10.1',
      target: 'vllm-2026.11.1',
    })
    expect(link.calls.find((c) => c.path === '/environments/probe')?.body).toMatchObject({
      descriptor_id: 'vllm-2026.11.1',
    })
    expect(link.calls.some((c) => c.path === '/engines/vllm/update')).toBe(false)
  })

  // Recorded on Ubuntu 26.04 (RTX 5090 Laptop, driver 595.99): the core's probe of the new release
  // finds the installed one; the reinstall removes it first, so only the driver blocks this update.
  it('leaves out the installed release from the update plan’s blockers, keeping the others', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('tensorrt-llm', {
      active: { version: 'tensorrt-llm-1.2.1-r1', variant: 'linux/amd64' },
      update: { needed: true, target: { version: 'tensorrt-llm-1.3.0rc29-r3' }, apply: 'reinstall' },
    })
    const driver = {
      code: 'MANAGED_PREREQUISITE_BLOCKED',
      message: 'The NVIDIA driver is too old: this engine needs 615.0 or newer, this machine has 595.99.02.',
      reason: 'driver-too-old',
    }
    const installed = {
      code: 'MANAGED_OPERATION_CONFLICT',
      message:
        'This engine is already installed from tensorrt-llm-1.2.1-r1; remove it before setting up tensorrt-llm-1.3.0rc29-r3.',
      reason: 'installed-with-other-descriptor',
    }
    link.responses['POST /environments/probe'] = plan('tensorrt-llm', {
      availability: 'prerequisite-blocked',
      blockers: [driver, installed] as never,
    })
    const result = await installEngine(link, 'tensorrt-llm', { request_id: 'r-1' })
    expect(result).toMatchObject({ status: 'update' })
    const offered = (result as { state: { plan: { blockers: unknown[] } } }).state.plan
    expect(offered.blockers).toEqual([driver])
  })

  it('begins the reinstall once the request names the release the person agreed to', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('vllm', {
      active: { version: 'vllm-2026.10.1', variant: 'linux/amd64' },
      update: {
        needed: true,
        target: { version: 'vllm-2026.11.1', variant: 'linux/amd64' },
        apply: 'reinstall',
      },
    })
    link.responses['POST /engines/vllm/update'] = { operation_id: 'op-remove' }
    const result = await installEngine(link, 'vllm', { request_id: 'r-9', approved_update: 'vllm-2026.11.1' })
    expect(result).toEqual({
      engine: 'vllm',
      status: 'updating',
      operation_id: 'op-remove',
      request_id: 'r-9',
    })
    expect(link.calls.find((c) => c.path === '/engines/vllm/update')?.body).toEqual({ request_id: 'r-9' })
  })

  it('says an installed engine with nothing newer is ready, and begins nothing', async () => {
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = versions('tensorrt-llm', {
      active: { version: 'tensorrt-llm-2026.10.1', variant: 'linux/amd64' },
      update: { needed: false, target: null, apply: 'reinstall' },
    })
    expect(await installEngine(link, 'tensorrt-llm')).toEqual({
      engine: 'tensorrt-llm',
      status: 'ready',
      active: { version: 'tensorrt-llm-2026.10.1', variant: 'linux/amd64' },
    })
    expect(link.calls.some((c) => c.path.endsWith('/update') || c.path.endsWith('/operations'))).toBe(false)
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

describe('model ids in paths', () => {
  // The core decodes `:param` segments but takes `*rest` (a model id, slashes included) as sent, as
  // its own client and the desktop app send it: percent-encoding here would name another model.
  it.each([
    ['models.info', '/models/llamacpp-upstream/owner/model+q4@v1/capabilities'],
    ['models.logs', '/models/llamacpp-upstream/owner/model+q4@v1/logs'],
    ['models.remove', '/managed-models/owner/model+q4@v1'],
  ])('%s sends the id as the core reads it', async (operation, path) => {
    const link = fakeCoreLink()
    await coreOperation(link, operation, { provider: 'llamacpp-upstream', model_id: 'owner/model+q4@v1' })
    expect(link.calls.at(-1)?.path).toBe(path)
  })

  it.each(['owner/../x', 'owner/a?b', 'owner/a#b', ''])('refuses %j as a model id', async (model_id) => {
    await expect(
      coreOperation(fakeCoreLink(), 'models.info', { provider: 'llamacpp-upstream', model_id })
    ).rejects.toThrow('Invalid')
  })
})

it.each([{ flash_attn: 'qa-invalid-mode' }, { cache_type_k: 'qa-invalid-cache' }, { threads: '4' }])(
  'rejects an invalid settings patch before calling core: %j',
  async (values) => {
    const link = fakeCoreLink()
    await expect(
      coreOperation(link, 'settings.update', { provider: 'llamacpp-upstream', values })
    ).rejects.toThrow()
    expect(link.calls).toEqual([])
  }
)
