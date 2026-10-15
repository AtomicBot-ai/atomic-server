import type {
  BackendCatalogResponse,
  ModelCompatibilityResponse,
  PrismFamily,
} from '@atomic-chat/core/contracts'
import { describe, expect, it } from 'vitest'
import { choosePrismBuild, defaultModelId, matchFamily, planGgufSetup } from './gguf-plan.js'
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
  family: matchFamily([family], family.repo, 'Bonsai-8B-Q1_0.gguf'),
  prism: catalog(),
  freeBytes: 10_000,
  ...over,
})

describe('planGgufSetup', () => {
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
    expect(codes(bonsai({ prism: catalog({ available: [] }) }))).toEqual(['no_engine_build'])
    expect(codes(bonsai({ freeBytes: 1000 }))).toEqual(['insufficient_disk_space'])
  })

  it('keeps the digest across free space and changes it when the work changes', () => {
    const base = planGgufSetup(bonsai())
    expect(planGgufSetup(bonsai({ freeBytes: 99_999 })).digest).toBe(base.digest)
    const installed = catalog({ installed: [{ version: 'prism-b12-bbbbbbb', backend: 'macos-arm64' }] })
    expect(planGgufSetup(bonsai({ prism: installed })).digest).not.toBe(base.digest)
  })
})

describe('choosePrismBuild', () => {
  it.each([
    ['the recommended build when it is new enough', 11, 'prism-b12-bbbbbbb', false, 300],
    ['the newest build when the recommended one is too old', 13, 'prism-b14-aaaaaaa', false, 400],
    ['nothing when no build is new enough', 15, null, false, 0],
  ])('picks %s', (_name, minBuild, version, installed, size) => {
    const build = choosePrismBuild(catalog(), minBuild)
    expect(
      build && { version: build.version, installed: build.installed, size: build.download_size }
    ).toEqual(version === null ? null : { version, installed, size })
  })

  it('downloads nothing for a build already on disk', () => {
    const disk = catalog({ installed: [{ version: 'prism-b12-bbbbbbb', backend: 'macos-arm64' }] })
    expect(choosePrismBuild(disk, 11)).toMatchObject({ installed: true, download_size: 0 })
  })
})

describe('matchFamily and defaultModelId', () => {
  it('matches a family file by repository (any case) and exact file name', () => {
    expect(matchFamily([family], 'Prism-ML/bonsai-8b-GGUF', 'Bonsai-8B-Q1_0.gguf')?.family.id).toBe(
      'bonsai-8b'
    )
    expect(matchFamily([family], family.repo, 'other.gguf')).toBeUndefined()
    expect(defaultModelId('owner/repo', 'sub/Model.gguf')).toBe('owner/Model')
  })
})
