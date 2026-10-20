import type {
  BackendCatalogResponse,
  ModelCompatibilityResponse,
  PrismFamily,
} from '@atomic-chat/core/contracts'
import { describe, expect, it } from 'vitest'
import { defaultModelId, matchFamily, planGgufSetup } from './gguf-plan.js'
import type { GgufPlanInput } from './gguf-plan.js'

const verdict = (over: Partial<ModelCompatibilityResponse> = {}): ModelCompatibilityResponse => ({
  outcome: 'compatible',
  provider: null,
  requires: [],
  evidence: 'header',
  rules_version: 3,
  reason: 'stock llama.cpp runs it',
  ...over,
})
const family: PrismFamily = {
  id: 'bonsai-8b',
  title: 'Bonsai 8B',
  repo: 'prism-ml/Bonsai-8B-gguf',
  revision: 'abc123',
  files: [{ file: 'Bonsai-8B-Q1_0.gguf', size: 1000, sha256: 'a'.repeat(64), treatment: 'prism_required' }],
  projectors: [
    { file: 'mmproj-old.gguf', size: 5, sha256: 'b'.repeat(64) },
    { file: 'mmproj.gguf', size: 50, sha256: 'c'.repeat(64), default: true },
  ],
}
const catalog = (over: Partial<BackendCatalogResponse> = {}) =>
  ({
    provider: 'atomic-prism',
    available: [
      { version: 'prism-b14-aaaaaaa', backend: 'macos-arm64' },
      { version: 'prism-b12-bbbbbbb', backend: 'macos-arm64' },
      { version: 'prism-b10-ccccccc', backend: 'macos-arm64' },
    ],
    installed: [],
    recommended: 'prism-b12-bbbbbbb/macos-arm64',
    recommended_installed: null,
    releases: [
      { tag: 'prism-b14-aaaaaaa', variants: [{ id: 'macos-arm64', size: 400 }] },
      { tag: 'prism-b12-bbbbbbb', variants: [{ id: 'macos-arm64', size: 300 }] },
    ],
    ...over,
  }) as BackendCatalogResponse
const bonsai = (over: Partial<GgufPlanInput> = {}): GgufPlanInput => ({
  request: { repo: family.repo, file: 'Bonsai-8B-Q1_0.gguf' },
  verdict: verdict({ outcome: 'engine_required', provider: 'atomic-prism', min_prism_build: 11 }),
  family: matchFamily([family], { family: 'bonsai-8b' }, 'Bonsai-8B-Q1_0.gguf'),
  prism: catalog(),
  freeBytes: 10_000,
  ...over,
})

describe('planGgufSetup', () => {
  // The core may name a family for a mirror (by sha256): download the family's own copy, which the
  // pinned revision and hash describe, never the mirror's path inside the family's repository.
  it.each([
    [
      'the family repository, file in a subfolder',
      family.repo,
      'sub/Bonsai-8B-Q1_0.gguf',
      'sub/Bonsai-8B-Q1_0.gguf',
    ],
    ['a mirror the core matched by hash', 'someone/mirror', 'q/Bonsai-8B-Q1_0.gguf', 'Bonsai-8B-Q1_0.gguf'],
  ])('downloads a family file from %s', (_name, repo, file, expected) => {
    const plan = planGgufSetup(
      bonsai({ request: { repo, file }, family: matchFamily([family], { family: 'bonsai-8b' }, file) })
    )
    expect(plan.model).toMatchObject({ repo: family.repo, file: expected, revision: 'abc123' })
  })

  it('plans a stock file from the Hub facts for llama.cpp, with no engine', () => {
    const plan = planGgufSetup({
      request: { repo: 'owner/repo', file: 'dir/model.Q4_K_M.gguf' },
      verdict: verdict(),
      hubFile: { size: 700, sha256: 'd'.repeat(64) },
      freeBytes: null,
    })
    expect(plan).toMatchObject({
      model_id: 'owner/model.Q4_K_M',
      provider: 'llamacpp-upstream',
      engine: null,
      model: { repo: 'owner/repo', file: 'dir/model.Q4_K_M.gguf', revision: 'main', size: 700 },
      projector: null,
      total_download_bytes: 700,
      blockers: [],
    })
    expect(plan.digest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('pins a Bonsai file to its family, adds the default projector and the recommended build', () => {
    expect(planGgufSetup(bonsai())).toMatchObject({
      provider: 'atomic-prism',
      engine: {
        provider: 'atomic-prism',
        version: 'prism-b12-bbbbbbb',
        installed: false,
        download_size: 300,
      },
      model: { repo: family.repo, revision: 'abc123', sha256: 'a'.repeat(64), size: 1000 },
      projector: { file: 'mmproj.gguf', size: 50 },
      total_download_bytes: 1350,
      blockers: [],
    })
    expect(
      planGgufSetup(bonsai({ request: { ...bonsai().request, include_projector: false } })).projector
    ).toBeNull()
  })

  it('blocks what cannot run, what is legacy, a missing build and a full disk', () => {
    const codes = (input: GgufPlanInput) => planGgufSetup(input).blockers.map((b) => b.code)
    expect(codes(bonsai({ verdict: verdict({ outcome: 'unsupported', reason: 'F16 master' }) }))).toEqual([
      'unsupported',
    ])
    expect(
      planGgufSetup(bonsai({ verdict: verdict({ outcome: 'legacy_artifact', replacement: 'new.gguf' }) }))
        .blockers[0]
    ).toMatchObject({ code: 'legacy_artifact', replacement: 'new.gguf' })
    expect(codes(bonsai({ prism: catalog({ recommended: null }) }))).toEqual(['no_engine_build'])
    expect(codes(bonsai({ freeBytes: 1000 }))).toEqual(['insufficient_disk_space'])
  })

  it('keeps the digest across free space and changes it when the work changes', () => {
    const base = planGgufSetup(bonsai())
    expect(planGgufSetup(bonsai({ freeBytes: 99_999 })).digest).toBe(base.digest)
    const installed = catalog({ installed: [{ version: 'prism-b12-bbbbbbb', backend: 'macos-arm64' }] })
    expect(planGgufSetup(bonsai({ prism: installed })).digest).not.toBe(base.digest)
  })
})

// The core picks the build for the file (`requires`/`min_build` in the catalog request); the plan
// takes its `recommended` as it is and only reads whether it is on disk and how big it is.
describe('the PrismML build', () => {
  const engine = (input: GgufPlanInput) => {
    const plan = planGgufSetup(input)
    return { engine: plan.engine, blockers: plan.blockers.map((b) => b.code) }
  }

  it.each([
    ['the recommended build', catalog(), 'prism-b12-bbbbbbb', false, 300],
    [
      'the recommended build even below min_prism_build: the core already applied it',
      catalog({ recommended: 'prism-b10-ccccccc/macos-arm64' }),
      'prism-b10-ccccccc',
      false,
      0,
    ],
    [
      'an installed recommended build with nothing to download',
      catalog({ installed: [{ version: 'prism-b12-bbbbbbb', backend: 'macos-arm64' }] }),
      'prism-b12-bbbbbbb',
      true,
      0,
    ],
  ])('takes %s', (_name, prism, version, installed, size) => {
    expect(engine(bonsai({ prism }))).toEqual({
      engine: { provider: 'atomic-prism', version, backend: 'macos-arm64', installed, download_size: size },
      blockers: [],
    })
  })

  it.each([
    ['the core found no build for the file (BACKEND_BUILD_UNAVAILABLE)', null],
    ['an empty catalog', catalog({ available: [], recommended: null })],
    ['a malformed recommendation', catalog({ recommended: 'prism-b12-bbbbbbb' })],
  ])('blocks with no_engine_build on %s', (_name, prism) => {
    expect(engine(bonsai({ prism }))).toEqual({ engine: null, blockers: ['no_engine_build'] })
  })

  it('runs a compatible file on the installed build the catalog recommends', () => {
    const compatible = verdict({ outcome: 'compatible', provider: 'atomic-prism' })
    expect(
      engine(
        bonsai({
          verdict: compatible,
          prism: catalog({ recommended_installed: 'prism-b10-ccccccc/macos-arm64' }),
        })
      ).engine
    ).toEqual({
      provider: 'atomic-prism',
      version: 'prism-b10-ccccccc',
      backend: 'macos-arm64',
      installed: true,
      download_size: 0,
    })
  })
})

describe('matchFamily and defaultModelId', () => {
  it("takes the family the core's verdict names, and its file by name", () => {
    expect(matchFamily([family], { family: 'bonsai-8b' }, 'sub/Bonsai-8B-Q1_0.gguf')?.file.size).toBe(1000)
    expect(matchFamily([family], {}, 'Bonsai-8B-Q1_0.gguf')).toBeUndefined()
    expect(matchFamily([family], { family: 'bonsai-8b' }, 'other.gguf')).toBeUndefined()
    expect(defaultModelId('owner/repo', 'sub/Model.gguf')).toBe('owner/Model')
  })
})
