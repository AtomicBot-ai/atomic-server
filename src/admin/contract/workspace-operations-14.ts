import type { WorkspaceOperation } from './workspace.js'
export const OPERATIONS_14: readonly WorkspaceOperation[] = [
  {
    name: 'media.video.job',
    title: 'Video progress',
    group: 'media',
    description: 'Video progress',
    mutates: false,
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'media.video.cancel',
    title: 'Cancel video',
    group: 'media',
    description: 'Cancel video',
    mutates: true,
    effect: 'interrupt',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'media.video.export',
    title: 'Export video',
    group: 'media',
    description: 'Export video',
    mutates: true,
    effect: 'configure',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, targetPath: { type: 'string' } },
      required: ['id', 'targetPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'media.video.estimate',
    title: 'Estimate video',
    group: 'media',
    description:
      'Estimate video Request fields: prompt, negativePrompt, width, height, steps, cfgScale, guidance, seed, fps, frames, samplingMethod, flowShift, workflow. Engine capability limits apply.',
    mutates: false,
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            prompt: {},
            negativePrompt: {},
            width: { type: 'integer', minimum: 16 },
            height: { type: 'integer', minimum: 16 },
            steps: { type: 'integer', minimum: 1 },
            cfgScale: { type: 'number' },
            guidance: { type: 'number' },
            seed: { type: 'integer' },
            fps: { type: 'integer', minimum: 1 },
            frames: { type: 'integer', minimum: 1 },
            samplingMethod: {},
            flowShift: { type: 'number' },
            workflow: { type: 'string', enum: ['create'] },
          },
          required: ['prompt', 'width', 'height', 'steps', 'cfgScale'],
          additionalProperties: true,
        },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
  {
    name: 'media.embedding.run',
    title: 'Embedding Run',
    group: 'media',
    description:
      'Embedding Run Request fields: input, model, encoding_format, dimensions. Engine capability limits apply.',
    mutates: true,
    effect: 'generate',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'object',
          properties: {
            input: {
              description:
                'Text input. For batches/media use advanced JSON with the native embeddings schema.',
            },
            model: {},
            encoding_format: { type: 'string', enum: ['float', 'base64'] },
            dimensions: { type: 'integer', minimum: 1 },
          },
          required: ['input'],
          additionalProperties: true,
        },
      },
      required: ['request'],
      additionalProperties: false,
    },
  },
]
