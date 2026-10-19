import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'
import {
  CONFIGURE_REQUEST,
  DECISION_CONFIG_REQUEST,
  DECISION_REQUEST,
  EMBEDDING_CONFIG_REQUEST,
  EMBEDDING_REQUEST,
  IMAGE_REQUEST,
  LOAD_REQUEST,
  ROUTER_REQUEST,
  VIDEO_REQUEST,
} from './media-requests.js'

/** Playground workloads beyond chat: images, video, embeddings and decisions. */
export const MEDIA_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'media.status',
    'Status',
    'read',
    'Read the state of the image and video engine and the diffusion model it has loaded.'
  ),
  operation(
    'media.capabilities',
    'Capabilities',
    'read',
    'Read what image generation supports on the loaded model.'
  ),
  operation(
    'media.video.capabilities',
    'Video Capabilities',
    'read',
    'Read what video generation supports on the loaded model.'
  ),
  operation('media.image.gallery', 'Image Gallery', 'read', 'List generated images (the latest 100).'),
  operation('media.video.gallery', 'Video Gallery', 'read', 'List generated videos (the latest 100).'),
  operation('media.files', 'Files', 'read', 'List the diffusion model files available to load.'),
  operation(
    'media.configure',
    'Configure',
    'configure',
    'Configure image and video generation: output folders and idle unload. Engine capability limits apply.',
    {
      properties: {
        request: CONFIGURE_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation(
    'media.load',
    'Load',
    'load',
    'Load a diffusion model for image or video generation. Engine capability limits apply.',
    {
      properties: {
        request: LOAD_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation(
    'media.embedding.configure',
    'Embedding Configure',
    'configure',
    'Configure the embedding model, its files and runtime limits. Engine capability limits apply.',
    {
      properties: {
        request: EMBEDDING_CONFIG_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation(
    'media.decision.configure',
    'Decision Configure',
    'configure',
    'Configure the decision model, its files and runtime limits. Engine capability limits apply.',
    {
      properties: {
        request: DECISION_CONFIG_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation('media.unload', 'Unload', 'interrupt', 'Unload the diffusion model.'),
  operation('media.embedding.load', 'Embedding Load', 'load', 'Load the configured embedding model.'),
  operation('media.embedding.unload', 'Embedding Unload', 'interrupt', 'Unload the embedding model.'),
  operation('media.decision.load', 'Decision Load', 'load', 'Load the configured decision model.'),
  operation('media.decision.unload', 'Decision Unload', 'interrupt', 'Unload the decision model.'),
  operation(
    'media.image.create',
    'Generate image',
    'generate',
    'Start an image generation job from a prompt; read media.image.job for its progress and result. Engine capability limits apply.',
    {
      properties: {
        request: IMAGE_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation('media.image.job', 'Image progress', 'read', 'Read the progress and result of an image job.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
  operation(
    'media.image.cancel',
    'Cancel image',
    'interrupt',
    'Cancel an image job that is queued or running.',
    {
      properties: { id: { type: 'string' } },
      required: ['id'],
    }
  ),
  operation(
    'media.image.export',
    'Export image',
    'configure',
    'Copy a generated image to a path on the server machine.',
    { properties: { id: { type: 'string' }, targetPath: { type: 'string' } }, required: ['id', 'targetPath'] }
  ),
  operation(
    'media.video.create',
    'Generate video',
    'generate',
    'Start a video generation job from a prompt; read media.video.job for its progress and result. Engine capability limits apply.',
    { properties: { request: VIDEO_REQUEST }, required: ['request'] }
  ),
  operation('media.video.job', 'Video progress', 'read', 'Read the progress and result of a video job.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
  operation(
    'media.video.cancel',
    'Cancel video',
    'interrupt',
    'Cancel a video job that is queued or running.',
    {
      properties: { id: { type: 'string' } },
      required: ['id'],
    }
  ),
  operation(
    'media.video.export',
    'Export video',
    'configure',
    'Copy a generated video to a path on the server machine.',
    { properties: { id: { type: 'string' }, targetPath: { type: 'string' } }, required: ['id', 'targetPath'] }
  ),
  operation(
    'media.video.estimate',
    'Estimate video',
    'read',
    'Estimate the cost of a video job without starting it. Engine capability limits apply.',
    { properties: { request: VIDEO_REQUEST }, required: ['request'] }
  ),
  operation(
    'media.embedding.run',
    'Embedding Run',
    'generate',
    'Compute embeddings for the input (OpenAI embeddings schema). Engine capability limits apply.',
    {
      properties: {
        request: EMBEDDING_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation(
    'media.decision.run',
    'Decision Run',
    'generate',
    'Answer questions about a state with the decision model. Engine capability limits apply.',
    {
      properties: {
        request: DECISION_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation(
    'media.router.run',
    'Router Run',
    'generate',
    'Score candidates for a task against a criterion with the decision model. Engine capability limits apply.',
    {
      properties: {
        request: ROUTER_REQUEST,
      },
      required: ['request'],
    }
  ),
  operation(
    'media.embedding.status',
    'Embedding status',
    'read',
    'Read whether the embedding model is loaded and ready.'
  ),
  operation(
    'media.embedding.config',
    'Embedding settings',
    'read',
    'Read the embedding model configuration.'
  ),
  operation(
    'media.decision.status',
    'Decision status',
    'read',
    'Read whether the decision model is loaded and ready.'
  ),
  operation('media.decision.config', 'Decision settings', 'read', 'Read the decision model configuration.'),
]
