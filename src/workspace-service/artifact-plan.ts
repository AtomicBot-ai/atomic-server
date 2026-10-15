import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DownloadItem } from '../downloads/index.js'
import type { CatalogRow } from './catalog.js'
import { object } from './validation.js'
export interface ArtifactPlan {
  digest: string
  category: string
  model_id: string
  name: string
  engine: string
  files: DownloadItem[]
  total_download_bytes: number
  load: Record<string, unknown>
  created_at: number
}
export interface ArtifactJob {
  id: string
  plan: ArtifactPlan
  stage: 'queued' | 'installing_engine' | 'downloading' | 'ready' | 'failed' | 'cancelled' | 'interrupted'
  error?: string
  updated_at: number
}
function safe(value: string): string {
  if (!/^[\w.-]+$/.test(value) || value === '.' || value === '..')
    throw new Error('Invalid catalog identifier.')
  return value
}
function filePath(value: unknown): string {
  const path = String(value ?? '')
  if (!path || path.startsWith('/') || path.split(/[\\/]/).some((p) => p === '..' || p === ''))
    throw new Error('Invalid catalog file path.')
  return path
}
export function artifactPlan(row: CatalogRow, dataFolder: string, quant?: string): ArtifactPlan {
  const r = row.source,
    files: DownloadItem[] = [],
    category = row.category,
    root = `workspace-models/${category}/${safe(row.id)}`
  const add = (
    source: Record<string, unknown>,
    path: string,
    repo = String(r['repo']),
    revision = String(r['revision'] ?? 'main')
  ) => {
    const file = filePath(source['filename'] ?? source['path']),
      repoId = String(source['repo'] ?? repo)
    if (!/^[\w.-]+\/[\w.-]+$/.test(repoId)) throw new Error('Invalid catalog repository.')
    const save_path = `${root}/${filePath(path)}`
    files.push({
      url: `https://huggingface.co/${repoId}/resolve/${encodeURIComponent(revision)}/${file.split('/').map(encodeURIComponent).join('/')}`,
      save_path,
      size: Number(source['bytes']) || null,
      sha256: typeof source['sha256'] === 'string' ? source['sha256'] : null,
    })
    return join(dataFolder, save_path)
  }
  let load: Record<string, unknown>,
    engine: string,
    model_id = row.id
  if (category === 'image' || category === 'video') {
    const transformer = object(r['transformer']),
      quants = transformer['quants'] as Record<string, unknown>[]
    if (!Array.isArray(quants)) throw new Error('This catalog family has no downloadable quantization.')
    const choice = quant
      ? quants.find((q) => q['id'] === quant)
      : (quants.find((q) => q['recommended'] === true) ?? quants[0])
    if (!choice) throw new Error('Choose an available quantization.')
    model_id = `${row.id}:${String(choice['id'])}`
    const paths: Record<string, unknown> = {
      diffusionModel: add(choice, `transformer/${String(choice['filename'])}`, String(transformer['repo'])),
    }
    for (const [catalogKey, field] of [
      ['vae', 'vae'],
      ['audio_vae', 'audioVae'],
    ] as const) {
      const source = object(r[catalogKey])
      if (source['filename']) paths[field] = add(source, `${catalogKey}/${String(source['filename'])}`)
    }
    for (const source of (r['text_encoders'] ?? []) as Record<string, unknown>[]) {
      const rawField = String(source['field'])
      const field =
        (
          {
            clip_l: 'clipL',
            llm_vision: 'llmVision',
            embeddings_connectors: 'embeddingsConnectors',
          } as Record<string, string>
        )[rawField] ?? rawField
      if (!['clipL', 't5xxl', 'llm', 'llmVision', 'qwen2vl', 'embeddingsConnectors'].includes(field))
        throw new Error(`Unsupported encoder role ${field}.`)
      paths[field] = add(source, `${field}/${String(source['filename'])}`)
    }
    if (r['vae_format']) paths['vaeFormat'] = r['vae_format']
    const defaults = object(r['defaults']),
      ranges = object(r['ranges']),
      video = object(r['video'])
    load = {
      modelId: model_id,
      family: row.id,
      modality: category,
      displayName: row.name,
      files: paths,
      engine: 'sd-cpp',
      offload: 'model',
      defaults: {
        steps: defaults['steps'],
        cfgScale: defaults['cfg_scale'],
        width: defaults['width'],
        height: defaults['height'],
        ...(defaults['guidance'] !== undefined ? { guidance: defaults['guidance'] } : {}),
        ...(defaults['sampling_method'] ? { samplingMethod: defaults['sampling_method'] } : {}),
        ...(defaults['flow_shift'] !== undefined ? { flowShift: defaults['flow_shift'] } : {}),
        ...(defaults['sigmas'] ? { sigmas: defaults['sigmas'] } : {}),
        ...(category === 'video'
          ? {
              video: {
                fps: video['fps'],
                frames: video['frames'],
                frameStep: video['frame_step'],
                frameOffset: video['frame_offset'],
                resolutionPresets: video['resolution_presets'],
              },
            }
          : {}),
      },
      ranges: {
        steps: ranges['steps'],
        dims: ranges['dims'],
        dimMultiple: ranges['dim_multiple'],
        ...(video['frame_range'] ? { frames: video['frame_range'] } : {}),
      },
    }
    engine = 'sd-cpp'
  } else {
    const sourceFiles = r['files'] as Record<string, unknown>[]
    if (!Array.isArray(sourceFiles) || !sourceFiles.length)
      throw new Error('This model has no downloadable files.')
    const downloaded = sourceFiles.map((source) => ({ source, path: add(source, String(source['path'])) }))
    const gguf =
      downloaded.find((f) => f.source['role'] === 'model') ??
      downloaded.find(
        (f) => String(f.source['path']).endsWith('.gguf') && !/mmproj/.test(String(f.source['path']))
      )
    const projector = downloaded.find(
      (f) => f.source['role'] === 'mmproj' || /mmproj/.test(String(f.source['path']))
    )
    load = {
      enabled: true,
      model_id: row.id,
      model_path: gguf?.path ?? join(dataFolder, root),
      ctx_size: r['context'],
      ...(projector ? { mmproj_path: projector.path } : {}),
    }
    if (category === 'embedding')
      load = { ...load, pooling: r['pooling'] ?? '', image_max_tokens: r['image_max_tokens'] ?? 0 }
    engine = String(r['engine'] ?? (category === 'decision' ? 'llamacpp' : 'llamacpp-upstream'))
  }
  const plan = {
    category,
    model_id,
    name: row.name,
    engine,
    files,
    total_download_bytes: files.reduce((sum, f) => sum + (f.size ?? 0), 0),
    load,
  }
  return {
    ...plan,
    digest: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
    created_at: Date.now(),
  }
}
