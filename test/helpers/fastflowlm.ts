import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { vi } from 'vitest'
import type { FastFlowLmDefinition } from '@atomic-chat/core/contracts'
import { defaultConfig } from '../../src/config/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import baseline from '../../src/workspace-service/models/model-catalog-baseline.json' with { type: 'json' }
import { fakeCoreLink } from './fake-core-link.js'
import { tmpDataFolder } from './tmp-data-folder.js'

/** Synthetic bytes for the pinned native checkpoint layout; never downloads a real model. */
export async function flmFixture() {
  const { paths, cleanup } = tmpDataFolder()
  await mkdir(paths.atcDir, { recursive: true })
  const names = [
    'config.json',
    'model.q4nx',
    'tokenizer.json',
    'tokenizer_config.json',
    'attn.xclbin',
    'dequant.xclbin',
    'layer.xclbin',
    'lm_head.xclbin',
    'mm.xclbin',
  ]
  const bytes = new Map(
    names.map((name) => [
      name,
      Buffer.from(
        name === 'config.json'
          ? JSON.stringify({ flm_version: '1.0.11', max_position_embeddings: 40960 })
          : name
      ),
    ])
  )
  const definition: FastFlowLmDefinition = {
    model_id: 'qwen3-0.6b',
    variant_id: 'qwen3-0.6b-npu2',
    name: 'Fixture Qwen',
    checkpoint: 'qwen3:0.6b',
    minimum_flm_version: 'flm-1.0.11-r2',
    local_only_protocol: 1,
    npu_generation: 'xdna2',
    context_length: 2048,
    license: 'fixture',
    gated: false,
    capabilities: { chat: true, tools: false, reasoning: false, structured_output: false },
    sources: [{ id: 'model', repo: 'fixture/qwen', revision: 'a'.repeat(40) }],
    files: names.map((path) => ({
      source: 'model',
      source_path: path,
      path,
      size: bytes.get(path)!.length,
      sha256: createHash('sha256').update(bytes.get(path)!).digest('hex'),
    })),
    components: {
      weights: ['model.q4nx'],
      config: ['config.json'],
      tokenizer: ['tokenizer.json'],
      chat_template: ['tokenizer_config.json'],
      kernels: names.filter((n) => n.endsWith('.xclbin')),
      metadata: [],
    },
    qualification: { status: 'qualified', evidence: ['https://fixture.test/qualification'] },
  }
  const catalog = {
    ...structuredClone(baseline),
    models: {
      ...baseline.models,
      fixture: {
        kind: 'fastflowlm',
        format: 'fastflowlm',
        definition,
        variants: { [definition.variant_id]: {} },
      },
    },
    collections: {
      ...baseline.collections,
      'fastflowlm-models': {
        header: { schema_version: 1 },
        entries: [{ model: 'fixture', variant: definition.variant_id }],
      },
    },
  }
  const path = join(paths.atcDir, 'catalog.json')
  const save = () => writeFile(path, JSON.stringify(catalog))
  await save()
  const link = fakeCoreLink()
  link.responses['POST /models/fastflowlm/check'] = {
    verdict: 'ok',
    reason: null,
    requirements: null,
    metadata: null,
  }
  link.responses['GET /runtimes/fastflowlm/accelerators'] = {
    ready: true,
    devices: [],
    blockers: [],
    runtime_account: 'fixture',
    runtime_mode: 'interactive',
    runtime_service: null,
  }
  link.responses['POST /runtimes/fastflowlm/probe'] = {
    status: 'ready',
    plan_digest: 'sha256:' + 'a'.repeat(64),
    blockers: [],
    changes: [],
    packages: [],
    runtime_account: 'fixture',
    runtime_mode: 'interactive',
    runtime_service: null,
  }
  link.responses['GET /runtimes/fastflowlm/operations'] = []
  link.responses['GET /models/fastflowlm/maintenance'] = []
  link.responses['POST /models/fastflowlm/maintenance'] = {
    operation_id: 'maintenance-1',
    ready_to_mutate: true,
  }
  link.responses['POST /models/fastflowlm/maintenance/maintenance-1/complete'] = { state: 'completed' }
  const request = vi.fn(async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const body = bytes.get(new URL(String(input)).pathname.split('/').at(-1)!)
    if (!body) throw new Error('Unexpected fixture URL: ' + String(input))
    return new Response(new Uint8Array(body), { headers: { 'content-length': String(body.length) } })
  })
  const options = {
    paths,
    link,
    config: defaultConfig(),
    fetch: request,
    env: { ATOMIC_MODEL_CATALOG_URL: pathToFileURL(path).href },
  }
  return {
    paths,
    cleanup,
    definition,
    catalog,
    save,
    bytes,
    link,
    request,
    options,
    service: new WorkspaceService(options),
  }
}
