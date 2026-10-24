import { request } from './define.js'

// The Core request bodies of the media operations, kept apart so `media.ts` reads as a list.

/** A video job, as media.video.create runs it and media.video.estimate prices it. */
export const VIDEO_REQUEST = request(
  {
    prompt: { default: '' },
    negativePrompt: {},
    width: { type: 'integer', minimum: 16, default: 512 },
    height: { type: 'integer', minimum: 16, default: 512 },
    steps: { type: 'integer', minimum: 1, default: 20 },
    cfgScale: { type: 'number', default: 7 },
    guidance: { type: 'number' },
    seed: { type: 'integer' },
    fps: { type: 'integer', minimum: 1 },
    frames: { type: 'integer', minimum: 1 },
    samplingMethod: {},
    flowShift: { type: 'number' },
    workflow: { type: 'string', enum: ['create'], default: 'create' },
  },
  ['prompt', 'width', 'height', 'steps', 'cfgScale']
)

/** Diffusion output folders and idle unload. */
export const CONFIGURE_REQUEST = request({
  dataFolder: {},
  outputDir: {},
  videoOutputDir: {},
  idleUnloadSecs: { type: 'integer', minimum: 0 },
})

/** A diffusion model to load and how to run it. */
export const LOAD_REQUEST = request(
  {
    modelId: {},
    family: {},
    modality: { type: 'string', enum: ['image', 'video'] },
    displayName: {},
    files: { type: 'object' },
    defaults: { type: 'object' },
    ranges: { type: 'object' },
    offload: { type: 'string', enum: ['none', 'group', 'model'] },
    offloadFallback: { type: 'string', enum: ['none', 'group', 'model'] },
    engine: { type: 'string', enum: ['sd-cpp'] },
    threads: { type: 'integer', minimum: 0 },
    startupTimeoutSecs: { type: 'integer', minimum: 1 },
  },
  ['modelId', 'family', 'modality', 'displayName', 'files', 'defaults', 'ranges', 'offload']
)

/** The embedding model, its files and runtime limits. */
export const EMBEDDING_CONFIG_REQUEST = request({
  enabled: { type: 'boolean' },
  model_path: {},
  mmproj_path: {},
  model_id: {},
  ctx_size: { type: 'integer', minimum: 0 },
  pooling: { type: 'string', enum: ['', 'mean', 'cls', 'last'] },
  image_max_tokens: { type: 'integer', minimum: 0 },
  threads: { type: 'integer', minimum: 0 },
  idle_unload_secs: { type: 'integer', minimum: 0 },
  startup_timeout_secs: { type: 'integer', minimum: 1 },
  engine_path: {},
})

/** The decision model, its files and runtime limits. */
export const DECISION_CONFIG_REQUEST = request({
  enabled: { type: 'boolean' },
  model_path: {},
  mmproj_path: {},
  model_id: {},
  ctx_size: { type: 'integer', minimum: 0 },
  spec_path: {},
  threads: { type: 'integer', minimum: 0 },
  timeout_ms: { type: 'integer', minimum: 1 },
  idle_unload_secs: { type: 'integer', minimum: 0 },
  startup_timeout_secs: { type: 'integer', minimum: 1 },
  allow_uncalibrated: { type: 'boolean' },
  engine_path: {},
  convert_type: { type: 'string', enum: ['f16', 'f32'] },
})

/** An image job. */
export const IMAGE_REQUEST = request(
  {
    prompt: { default: '' },
    negativePrompt: {},
    width: { type: 'integer', minimum: 16, default: 512 },
    height: { type: 'integer', minimum: 16, default: 512 },
    steps: { type: 'integer', minimum: 1, default: 20 },
    cfgScale: { type: 'number', default: 7 },
    guidance: { type: 'number' },
    seed: { type: 'integer' },
    batchSize: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
    samplingMethod: {},
    flowShift: { type: 'number' },
    workflow: {
      type: 'string',
      enum: ['create', 'transform', 'inpaint', 'extend', 'upscale', 'reference', 'edit'],
      default: 'create',
    },
    initImage: { type: 'object' },
    maskImage: { type: 'object' },
    referenceImages: { type: 'array', items: { type: 'object' } },
    strength: { type: 'number', minimum: 0, maximum: 1 },
  },
  ['prompt', 'width', 'height', 'steps', 'cfgScale']
)

/** Embedding input, as in the OpenAI embeddings schema. */
export const EMBEDDING_REQUEST = request(
  {
    input: {
      description: 'Text input. For batches/media use advanced JSON with the native embeddings schema.',
    },
    model: {},
    encoding_format: { type: 'string', enum: ['float', 'base64'] },
    dimensions: { type: 'integer', minimum: 1 },
  },
  ['input']
)

/** A state and the questions to answer about it. */
export const DECISION_REQUEST = request(
  {
    state: {},
    questions: { type: 'object' },
    truncation: { type: 'string', enum: ['allow', 'error'] },
    timeout_ms: { type: 'integer', minimum: 1 },
  },
  ['state', 'questions']
)

/** A task, a criterion and the candidates to score. */
export const ROUTER_REQUEST = request(
  {
    task: {},
    criterion: {},
    candidates: { type: 'array', items: { type: 'object' } },
    timeout_ms: { type: 'integer', minimum: 1 },
  },
  ['task', 'candidates']
)
