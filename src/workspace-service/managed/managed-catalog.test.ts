import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { environment, installation, plan } from '../../../test/helpers/managed-fixtures.js'
import { estimateWeightBytes, managedCatalog, managedSearch } from './managed-catalog.js'

const GIB = 1024 ** 3
const summary = {
  descriptor_id: 'sglang-2026.10.1',
  engine_id: 'sglang',
  notices: [],
  supported_architectures: ['Qwen3ForCausalLM', 'LlamaForCausalLM'],
  curated_models: [
    {
      repository: 'Qwen/Qwen3-8B',
      revision: 'a'.repeat(40),
      inventory_digest: 'sha256:x',
      vram_tier_bytes: 24 * GIB,
      note: 'Measured on an RTX 4090.',
    },
    {
      repository: 'meta-llama/Llama-3.1-8B-Instruct',
      revision: 'b'.repeat(40),
      inventory_digest: 'sha256:y',
      vram_tier_bytes: 24 * GIB,
      note: 'Gated.',
    },
  ],
}
const gpu = {
  gpu_id: 'GPU-0',
  name: 'RTX 4090',
  compute_capability: '8.9',
  total_vram_bytes: 24 * GIB,
  free_vram_bytes: 23 * GIB,
  driver_version: '590',
}

function link(over: { installed?: boolean; descriptor?: unknown } = {}) {
  const l = fakeCoreLink()
  l.responses['GET /environments'] = {
    environments: [
      environment({ gpus: [gpu], installations: over.installed === false ? [] : [installation('sglang')] }),
    ],
  }
  l.responses['POST /environments/probe'] = plan('sglang')
  l.responses['GET /environments/descriptors/sglang-2026.10.1'] = over.descriptor ?? summary
  return l
}

/** Hugging Face's search and repo answers, by the URL asked. */
function hub(entries: unknown[], exact?: Record<string, unknown>) {
  const asked: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    asked.push(url)
    if (url.includes('/api/models?')) return Response.json(entries)
    const repo = /\/api\/models\/([^?]+)\?/.exec(url)?.[1]
    if (repo && exact?.[repo]) return Response.json(exact[repo])
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { fetchImpl, asked }
}
const entry = (id: string, architectures: string[] | undefined, parameters?: Record<string, number>) => ({
  id,
  downloads: 10,
  ...(architectures ? { config: { architectures } } : {}),
  ...(parameters ? { safetensors: { parameters } } : {}),
})

describe('managedCatalog', () => {
  it("lists the curated models of the installed engine's descriptor", async () => {
    const result = await managedCatalog(link(), 'sglang')
    expect(result.descriptor_id).toBe('sglang-2026.10.1')
    expect(result.models.map((m) => m.repository)).toEqual([
      'Qwen/Qwen3-8B',
      'meta-llama/Llama-3.1-8B-Instruct',
    ])
  })

  it("reads the plan's descriptor while the engine is not installed", async () => {
    const result = await managedCatalog(link({ installed: false }), 'sglang')
    expect(result.models).toHaveLength(2)
  })

  it('says the descriptor is not available instead of an empty list', async () => {
    const l = link({ descriptor: new AtomicCoreError('MANAGED_METADATA_INVALID', 'Not cached.') })
    await expect(managedCatalog(l, 'sglang')).rejects.toThrow('not available')
  })
})

describe('managedSearch', () => {
  it('puts matching curated models first, then the safetensors feed narrowed by architecture and memory', async () => {
    const { fetchImpl, asked } = hub([
      entry('Qwen/Qwen3-8B', ['Qwen3ForCausalLM'], { BF16: 8e9 }),
      entry('someone/Mamba-7B', ['MambaForCausalLM'], { BF16: 7e9 }),
      entry('someone/Qwen3-235B', ['Qwen3ForCausalLM'], { BF16: 235e9 }),
      entry('someone/Qwen3-4B-AWQ', ['Qwen3ForCausalLM'], { I32: 4e9 }),
      entry('someone/no-config', undefined),
      entry('someone/Qwen3-unknown-size', ['Qwen3ForCausalLM']),
    ])
    const result = await managedSearch(
      { link: link(), fetch: fetchImpl, env: { HF_ENDPOINT: 'http://hub' } },
      'sglang',
      'qwen3'
    )
    expect(result.rows.map((r) => [r.repository, r.section])).toEqual([
      ['Qwen/Qwen3-8B', 'curated'],
      ['someone/Qwen3-4B-AWQ', 'feed'],
      ['someone/Qwen3-unknown-size', 'feed'],
    ])
    const search = new URL(asked.find((u) => u.includes('/api/models?'))!)
    expect(search.origin).toBe('http://hub')
    expect(search.searchParams.get('filter')).toBe('safetensors')
    expect(search.searchParams.getAll('expand[]')).toEqual(expect.arrayContaining(['config', 'safetensors']))
  })

  it('shows an exact owner/repo whatever the prefilter says', async () => {
    const { fetchImpl } = hub([], {
      'someone/Mamba-7B': entry('someone/Mamba-7B', ['MambaForCausalLM'], { BF16: 7e9 }),
    })
    const result = await managedSearch({ link: link(), fetch: fetchImpl }, 'sglang', 'someone/Mamba-7B')
    expect(result.rows).toEqual([
      expect.objectContaining({ repository: 'someone/Mamba-7B', section: 'exact' }),
    ])
  })
})

describe('estimateWeightBytes', () => {
  it.each([
    [{ BF16: 8e9 }, 16e9],
    [{ I32: 4e9, BF16: 1e9 }, 4e9],
    [{ F8_E4M3: 8e9 }, 8e9],
    [{}, null],
    [undefined, null],
  ])('%j', (parameters, bytes) => expect(estimateWeightBytes(parameters)).toBe(bytes))
})
