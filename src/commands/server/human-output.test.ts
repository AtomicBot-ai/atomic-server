import { describe, expect, it } from 'vitest'
import { humanLines } from './human-output.js'

const row = (id: string, name: string, format: string) => ({
  id,
  name,
  description: '',
  category: 'text',
  source: { format },
})

describe('humanLines', () => {
  it('tables the catalog and a search, with the format and a count', () => {
    const lines = humanLines('models.catalog', {
      rows: [row('a/One-GGUF', 'One', 'gguf'), row('b/Two', 'Two', 'mlx')],
    })!
    expect(lines[0]).toMatch(/^MODEL\s+NAME\s+FORMAT$/)
    expect(lines[2]).toMatch(/^a\/One-GGUF\s+One\s+GGUF$/)
    expect(lines[3]).toMatch(/^b\/Two\s+Two\s+MLX$/)
    expect(lines.at(-1)).toBe('2 models')
    expect(humanLines('models.search', [row('a/One-GGUF', 'One', 'gguf')])!.at(-1)).toBe('1 model')
  })

  it('tables the files of a repository with their sizes', () => {
    const lines = humanLines('models.files', [
      { filename: 'm-Q4_K_M.gguf', size: 730_893_248, sha256: 'x', downloadUrl: 'u' },
      { filename: 'mmproj.gguf', size: 918_166_080 },
    ])!
    expect(lines[0]).toMatch(/^FILE\s+SIZE$/)
    expect(lines[2]).toMatch(/^m-Q4_K_M\.gguf\s+697\.0 MiB$/)
  })

  it('describes a download plan: what, where, how big, and what blocks it', () => {
    const lines = humanLines('models.plan', {
      model_id: 'LiquidAI/LFM2-1.2B-Q4_K_M',
      provider: 'llamacpp-upstream',
      model: { repo: 'LiquidAI/LFM2-1.2B-GGUF', file: 'LFM2-1.2B-Q4_K_M.gguf', size: 730_893_248 },
      projector: null,
      engine: null,
      verdict: { outcome: 'compatible', reason: 'stock llama.cpp runs every tensor type' },
      total_download_bytes: 730_893_248,
      free_bytes: 91_592_507_392,
      blockers: ['Not enough free disk space.'],
    })!
    expect(lines).toEqual([
      'model     LiquidAI/LFM2-1.2B-Q4_K_M',
      'engine    llamacpp-upstream',
      'file      LiquidAI/LFM2-1.2B-GGUF/LFM2-1.2B-Q4_K_M.gguf (697.0 MiB)',
      'download  697.0 MiB (85.3 GiB free)',
      'verdict   compatible: stock llama.cpp runs every tensor type',
      'blocked   Not enough free disk space.',
    ])
  })

  it('lists hardware facts as the doctor words them', () => {
    const lines = humanLines('hardware.info', {
      info: {
        cpu: { name: 'Apple M4 Max', core_count: 16, arch: 'arm64' },
        os_type: 'macos',
        os_name: 'macOS 26.6.2',
        total_memory: 49152,
        gpus: [{ name: 'RTX 4090', vendor: 'NVIDIA', driver_version: '581.42' }],
      },
      source: 'probe',
      warnings: ['vulkaninfo not found'],
    })!
    expect(lines).toEqual([
      'CPU      Apple M4 Max (16 cores, arm64)',
      'memory   48 GB',
      'OS       macOS 26.6.2',
      'GPU      RTX 4090 (NVIDIA, driver 581.42)',
      'source   probe',
      'warning  vulkaninfo not found',
    ])
  })

  it('renders a flat object as key/value lines and an array of objects as a table, else nothing', () => {
    expect(
      humanLines('models.info', { modelId: 'm', vision: false, maxCtxTrain: 128000, dflashDrafts: [] })
    ).toEqual(['modelId       m', 'vision        false', 'maxCtxTrain   128000', 'dflashDrafts  (none)'])
    const table = humanLines('keys.list', [
      { id: 'k1', name: 'one' },
      { id: 'k2', name: 'two' },
    ])!
    expect(table[0]).toMatch(/^id\s+name$/)
    expect(table).toHaveLength(4)
    expect(humanLines('anything', 'text')).toBeUndefined()
    expect(humanLines('anything', { nested: { deep: { deeper: 1 } } })).toBeUndefined()
  })

  it('names Apple silicon where the core lists no GPU, as the doctor does', () => {
    const lines = humanLines('hardware.info', {
      info: {
        cpu: { name: 'Apple M4 Max', core_count: 16, arch: 'arm64' },
        os_type: 'macos',
        os_name: 'macOS 26.6.2',
        total_memory: 49152,
        gpus: [],
      },
      source: 'probe',
      warnings: [],
    })!
    expect(lines.find((l) => l.startsWith('GPU'))).toMatch(
      /^GPU\s+Apple M4 Max GPU \(Metal\), 48 GB unified memory$/
    )
  })
})
