import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { planFor, planRequest } from './gguf-facts.js'

describe('planRequest', () => {
  it.each([
    [
      { repo: 'o/r', file: 'm.gguf' },
      { repo: 'o/r', file: 'm.gguf' },
    ],
    [
      { repo: 'o/r', file: 'm.gguf', revision: 'abc', model_id: 'o/m', include_projector: false },
      { repo: 'o/r', file: 'm.gguf', revision: 'abc', model_id: 'o/m', include_projector: false },
    ],
  ])('keeps a valid request %j', (raw, expected) => {
    expect(planRequest(raw)).toEqual(expected)
  })

  it.each([
    [{ repo: '', file: 'm.gguf' }, 'repo and file'],
    [{ repo: 'o/r', file: 'model.safetensors' }, '.gguf'],
    [{ repo: 'o/r', file: 'm.gguf', revision: ' ' }, 'revision must be'],
  ])('refuses %j', (raw, message) => {
    expect(() => planRequest(raw)).toThrow(message)
  })
})

describe('planFor', () => {
  const link = () => {
    const l = fakeCoreLink()
    l.request = async <T>(method: string, path: string, body?: unknown) => {
      l.calls.push({ method, path, body })
      if (path === '/models/compatibility')
        return { outcome: 'compatible', provider: null, requires: [], reason: 'stock' } as T
      return { families: [] } as T
    }
    return l
  }
  const hub = (async () =>
    Response.json({
      sha: 'c'.repeat(40),
      siblings: [{ rfilename: 'm.gguf', size: 70, lfs: { sha256: 'e'.repeat(64), size: 70 } }],
    })) as typeof fetch

  it('asks the core for the verdict with a remote header read, and the Hub for size and hash', async () => {
    const l = link()
    const plan = await planFor({ link: l, fetch: hub, env: {} }, { repo: 'o/r', file: 'm.gguf' })
    // Pinned to the commit the Hub described: the URL then names exactly these bytes, and a file
    // uploaded again later is a new URL, so a partial of the old one is never continued with it.
    expect(plan.model).toEqual({
      repo: 'o/r',
      file: 'm.gguf',
      revision: 'c'.repeat(40),
      sha256: 'e'.repeat(64),
      size: 70,
    })
    expect(l.calls).toContainEqual({
      method: 'POST',
      path: '/models/compatibility',
      body: { repo: 'o/r', file: 'm.gguf', inspect_remote: true },
    })
    expect(l.calls.some((c) => c.path.endsWith('/catalog'))).toBe(false)
  })

  it('refuses a file the repository does not offer', async () => {
    await expect(
      planFor({ link: link(), fetch: hub, env: {} }, { repo: 'o/r', file: 'other.gguf' })
    ).rejects.toThrow('is not a GGUF file of o/r')
  })

  // The core decides which Bonsai family a file is (by sha256, else by repository and file name, a
  // file in a subfolder included); the plan follows its verdict instead of matching paths itself.
  it("takes the file's family from the core's verdict", async () => {
    const l = fakeCoreLink()
    l.responses['GET /models/atomic-prism/families'] = {
      families: [
        {
          id: 'bonsai-8b',
          title: 'Bonsai 8B',
          repo: 'prism-ml/Bonsai-8B-gguf',
          revision: 'abc123',
          files: [
            { file: 'Bonsai-8B-Q1_0.gguf', size: 1000, sha256: 'a'.repeat(64), treatment: 'prism_required' },
          ],
          projectors: [{ file: 'mmproj.gguf', size: 50, sha256: 'c'.repeat(64), default: true }],
        },
      ],
    }
    l.responses['POST /models/compatibility'] = {
      outcome: 'compatible',
      provider: 'atomic-prism',
      family: 'bonsai-8b',
      requires: [],
      reason: 'Bonsai',
    }
    l.responses['POST /backends/atomic-prism/catalog'] = {
      provider: 'atomic-prism',
      available: [],
      installed: [],
    }
    const noHub = (async () => expect.fail('a family file needs no Hub lookup')) as typeof fetch
    const plan = await planFor(
      { link: l, fetch: noHub, env: {} },
      { repo: 'prism-ml/Bonsai-8B-gguf', file: 'sub/Bonsai-8B-Q1_0.gguf' }
    )
    expect(plan.model).toMatchObject({ file: 'sub/Bonsai-8B-Q1_0.gguf', sha256: 'a'.repeat(64), size: 1000 })
    expect(plan.projector).toMatchObject({ file: 'mmproj.gguf' })
  })

  describe('the PrismML catalog', () => {
    const prismLink = (outcome: string, extra: Record<string, unknown>, catalog: () => unknown) => {
      const l = fakeCoreLink()
      l.request = async <T>(method: string, path: string, body?: unknown) => {
        l.calls.push({ method, path, body })
        if (path === '/models/compatibility')
          return { outcome, provider: 'atomic-prism', requires: [], reason: 'PrismML', ...extra } as T
        if (path === '/backends/atomic-prism/catalog') return catalog() as T
        return { families: [] } as T
      }
      return l
    }
    const catalog = () => ({
      provider: 'atomic-prism',
      available: [{ version: 'prism-b12-bbbbbbb', backend: 'cpu' }],
      installed: [],
      recommended: 'prism-b12-bbbbbbb/cpu',
      recommended_installed: null,
      releases: [{ tag: 'prism-b12-bbbbbbb', variants: [{ id: 'cpu', size: 300 }] }],
    })
    const catalogBody = (l: ReturnType<typeof fakeCoreLink>) =>
      l.calls.find((c) => c.path === '/backends/atomic-prism/catalog')?.body

    it.each([
      [
        'engine_required',
        { requires: ['pq2_0'], min_prism_build: 12 },
        { requires: ['pq2_0'], min_build: 12 },
      ],
      ['engine_update_required', { requires: ['pq2_0'] }, { requires: ['pq2_0'] }],
      ['engine_required', {}, { requires: [] }],
      ['compatible', { requires: ['pq2_0'], min_prism_build: 12 }, {}],
    ])('asks the catalog for a %s verdict %j with %j', async (outcome, extra, body) => {
      const l = prismLink(outcome, extra, catalog)
      await planFor({ link: l, fetch: hub, env: {} }, { repo: 'o/r', file: 'm.gguf' })
      expect(catalogBody(l)).toEqual(body)
    })

    it('plans the build the core recommends for the file', async () => {
      const l = prismLink('engine_required', { requires: ['pq2_0'] }, catalog)
      const plan = await planFor({ link: l, fetch: hub, env: {} }, { repo: 'o/r', file: 'm.gguf' })
      expect(plan.engine).toMatchObject({ version: 'prism-b12-bbbbbbb', backend: 'cpu', download_size: 300 })
      expect(plan.blockers).toEqual([])
    })

    it('turns BACKEND_BUILD_UNAVAILABLE into the no_engine_build blocker', async () => {
      const l = prismLink('engine_required', { requires: ['pq2_0'], min_prism_build: 99 }, () => {
        throw new AtomicCoreError('BACKEND_BUILD_UNAVAILABLE', 'No build meets the requirements.')
      })
      const plan = await planFor({ link: l, fetch: hub, env: {} }, { repo: 'o/r', file: 'm.gguf' })
      expect(plan.engine).toBeNull()
      expect(plan.blockers.map((b) => b.code)).toEqual(['no_engine_build'])
    })

    it('passes any other catalog failure on', async () => {
      const l = prismLink('engine_required', { requires: ['pq2_0'] }, () => {
        throw new AtomicCoreError('INVALID_ARGUMENT', 'bad requires')
      })
      await expect(
        planFor({ link: l, fetch: hub, env: {} }, { repo: 'o/r', file: 'm.gguf' })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    })
  })
})
