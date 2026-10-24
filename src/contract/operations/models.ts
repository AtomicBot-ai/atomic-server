import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'

/** Engines & Models: catalog, reviewed GGUF installs, durable setups and media/MLX installations. */
export const MODEL_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'models.catalog',
    'Model catalog',
    'read',
    'Browse the curated model catalog, optionally by category and search text; refresh fetches it again.',
    {
      properties: {
        category: { type: 'string', enum: ['text', 'image', 'video', 'embedding', 'decision'] },
        query: { type: 'string' },
        refresh: { type: 'boolean' },
        engine: { type: 'string', description: "A managed engine: its descriptor's curated models" },
      },
    }
  ),
  operation(
    'models.search',
    'Search Hugging Face',
    'read',
    "Search Hugging Face for model repositories. With a managed engine: its curated models first, then safetensors repositories narrowed by the descriptor's architectures and the largest card; an exact owner/repo is always shown. With foundry-local: conf's curated models, then Microsoft's catalog, each variant for this platform with the core's verdict.",
    { properties: { query: { type: 'string' }, engine: { type: 'string' } } }
  ),
  operation(
    'models.files',
    'Model files',
    'read',
    'List the model files a Hugging Face repository offers for download.',
    { properties: { repo: { type: 'string' } }, required: ['repo'] }
  ),
  operation(
    'models.installed',
    'Installed models',
    'read',
    'List the models installed in the data folder, MLX models included.'
  ),
  operation(
    'models.plan',
    'Review model installation',
    'read',
    'Plan a model installation without downloading: files, sizes, the engine it needs and any compatibility blockers. Its digest is what models.install accepts.',
    {
      properties: {
        repo: { type: 'string' },
        file: { type: 'string' },
        revision: { type: 'string' },
        model_id: { type: 'string' },
        include_projector: { type: 'boolean' },
      },
      required: ['repo', 'file'],
    }
  ),
  operation(
    'models.install',
    'Download reviewed model',
    'download',
    'Install exactly the reviewed plan (plan_digest from models.plan). Reusing request_id resumes the same durable setup.',
    {
      properties: {
        request: { type: 'object' },
        plan_digest: { type: 'string' },
        request_id: { type: 'string' },
      },
      required: ['request', 'plan_digest', 'request_id'],
    }
  ),
  operation(
    'models.load',
    'Load model',
    'load',
    "Load an installed model on a provider so the API serves it; the provider's engine is installed first when missing. Loading can unload another model on the same GPU.",
    {
      properties: { provider: { type: 'string' }, model_id: { type: 'string' }, options: { type: 'object' } },
      required: ['provider', 'model_id'],
    }
  ),
  operation('models.unload', 'Unload model', 'interrupt', 'Unload a loaded model and free its memory.', {
    properties: { provider: { type: 'string' }, model_id: { type: 'string' } },
    required: ['provider', 'model_id'],
  }),
  operation('models.cancel', 'Cancel model', 'interrupt', 'Cancel a model load that is still in progress.', {
    properties: { provider: { type: 'string' }, model_id: { type: 'string' } },
    required: ['provider', 'model_id'],
  }),
  operation('models.info', 'Info model', 'read', 'Read the capabilities of a model on a provider.', {
    properties: { provider: { type: 'string' }, model_id: { type: 'string' } },
    required: ['provider', 'model_id'],
  }),
  operation('models.logs', 'Logs model', 'read', 'Read the engine log of a loaded model.', {
    properties: { provider: { type: 'string' }, model_id: { type: 'string' } },
    required: ['provider', 'model_id'],
  }),
  operation(
    'models.remove',
    'Remove managed model',
    'configure',
    'Remove an installed model from the data folder. Unload it first; loaded-model protection applies.',
    { properties: { model_id: { type: 'string' } }, required: ['model_id'] }
  ),
  operation(
    'models.import',
    'Import local GGUF',
    'configure',
    'Register a local GGUF file, by absolute path on the server machine, as a model without copying it.',
    {
      properties: { path: { type: 'string', description: 'Absolute path to the .gguf file' } },
      required: ['path'],
    }
  ),
  operation(
    'setup.status',
    'Setup progress',
    'read',
    'List the guided model setups and their download progress.'
  ),
  operation(
    'setup.manual',
    'Set up manually',
    'configure',
    'Record that the workspace was set up manually. This claims nothing about model readiness.'
  ),
  operation(
    'setup.complete',
    'Finish setup',
    'configure',
    'Verify the selected loaded workload with a real request, then save setup completion. Needs a running API and a loaded model.',
    {
      properties: {
        model_id: {
          type: 'string',
          description: 'Model to verify; required when adding a workload alongside existing models',
        },
        service_id: { type: 'string', description: 'Optional loaded service ID to verify' },
      },
    }
  ),
  operation(
    'setup.resume',
    'Resume installation',
    'download',
    'Resume a paused or interrupted model setup.',
    { properties: { setup_id: { type: 'string' } }, required: ['setup_id'] }
  ),
  operation('setup.cancel', 'Cancel installation', 'interrupt', 'Cancel a model setup and its downloads.', {
    properties: { setup_id: { type: 'string' } },
    required: ['setup_id'],
  }),
  operation(
    'downloads.remove',
    'Remove download',
    'configure',
    'Stop a model download and delete its unshared files and partial download data. Installed models require installed=true and are deleted through the core; loaded models are protected.',
    {
      properties: {
        id: { type: 'string' },
        owner: { type: 'string', enum: ['setup', 'artifacts', 'managed', 'foundry'] },
        installed: { type: 'boolean' },
      },
      required: ['id', 'owner'],
    }
  ),
  operation(
    'artifacts.plan',
    'Review media installation',
    'read',
    'Plan a catalog model download by category, model and quantization, without downloading. Its digest is what artifacts.install accepts.',
    {
      properties: {
        category: { type: 'string', enum: ['text', 'image', 'video', 'embedding', 'decision'] },
        model_id: { type: 'string' },
        quant: { type: 'string' },
      },
      required: ['category', 'model_id'],
    }
  ),
  operation(
    'artifacts.install',
    'Download reviewed media',
    'download',
    'Download exactly the reviewed artifact plan (plan_digest from artifacts.plan) as a server-owned job.',
    {
      properties: { plan_digest: { type: 'string' }, request_id: { type: 'string' } },
      required: ['plan_digest', 'request_id'],
    }
  ),
  operation(
    'artifacts.list',
    'Media installations',
    'read',
    'List artifact downloads and installed artifacts.'
  ),
  operation(
    'artifacts.load',
    'Load installed media',
    'load',
    'Load an installed artifact into the engine for its workload.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'artifacts.resume',
    'Resume media download',
    'download',
    'Resume an interrupted artifact download.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation('artifacts.cancel', 'Cancel media download', 'interrupt', 'Cancel an artifact download.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
]
