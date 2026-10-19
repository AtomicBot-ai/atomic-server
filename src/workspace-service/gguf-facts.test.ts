import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
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
      siblings: [{ rfilename: 'm.gguf', size: 70, lfs: { sha256: 'e'.repeat(64), size: 70 } }],
    })) as typeof fetch

  it('asks the core for the verdict with a remote header read, and the Hub for size and hash', async () => {
    const l = link()
    const plan = await planFor({ link: l, fetch: hub, env: {} }, { repo: 'o/r', file: 'm.gguf' })
    expect(plan.model).toEqual({
      repo: 'o/r',
      file: 'm.gguf',
      revision: 'main',
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
})
