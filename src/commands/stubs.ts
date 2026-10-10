/**
 * Commands designed in this iteration and implemented in later ones. Their flags and help are
 * final; running one fails with `ATC_NOT_IMPLEMENTED` (exit 3) and names the iteration.
 */

import { defineCommand, notImplemented } from '../cli/index.js'
import { apiStart, apiStop, apiStatus } from './terminal.js'

const apiOptions = {
  'port': { type: 'string', description: 'API port', placeholder: 'port' },
  'host': {
    type: 'string',
    description: 'API bind address (0.0.0.0 to expose)',
    placeholder: 'host',
  },
  'api-key': { type: 'string', description: 'Require this key on the API', placeholder: 'key' },
  'api-key-file': {
    type: 'string',
    description: 'Read the key from a file (secrets mounts)',
    placeholder: 'path',
  },
} as const

const ENGINES = 'llamacpp-upstream, llamacpp, mlx or tensorrt-llm'

export const runCommand = notImplemented({
  name: 'run',
  summary: 'Start a downloaded model on the running server',
  description:
    'Loads the model on the active engine — the one running now, else engines.default — and makes it answer on the API. It downloads and starts nothing else: a missing model, server or engine is an error that names the command to run first (`atc models pull`, `atc start`, `atc engines install`). `atc unload` stops it; the desktop app calls these Run and Stop.',
  group: 'models',
  positionals: [{ name: 'model', description: 'Model id, as `atc models list` shows it', required: true }],
  options: {
    engine: {
      type: 'string',
      description: `Engine to run it on (${ENGINES}); remembered as engines.default`,
      placeholder: 'engine',
    },
    embedding: { type: 'boolean', description: 'Start it in embedding mode' },
  },
  examples: ['atc run qwen3-8b', 'atc run qwen3-8b --engine mlx'],
})

export const unloadCommand = notImplemented({
  name: 'unload',
  summary: 'Stop a running model and free its memory',
  description: 'The server keeps running and the model stays downloaded; `atc stop` stops the server.',
  group: 'models',
  positionals: [{ name: 'model', description: 'Model id; --all for every running model' }],
  options: { all: { type: 'boolean', description: 'Unload every running model' } },
  examples: ['atc unload qwen3-8b', 'atc unload --all'],
})

export const modelsCommand = defineCommand({
  name: 'models',
  summary: 'The catalog and the model files: search, download, list, remove, describe',
  group: 'models',
  subcommands: [
    notImplemented({
      name: 'search',
      summary: 'Search the curated catalog (and Hugging Face for owner/repo)',
      positionals: [{ name: 'query', description: 'Words, or owner/repo', required: true }],
      options: {
        limit: { type: 'string', description: 'Results to show', placeholder: 'n', default: '20' },
        fit: { type: 'boolean', description: 'Only models that fit this machine' },
      },
    }),
    notImplemented({
      name: 'pull',
      summary: 'Download a model into the data folder',
      positionals: [
        { name: 'model', description: 'owner/repo, owner/repo:file.gguf or a catalog alias', required: true },
      ],
      options: {
        'quant': { type: 'string', description: 'Quantisation to pick (e.g. Q4_K_M)', placeholder: 'quant' },
        'mmproj': { type: 'boolean', description: 'Also download the vision projector' },
        'hf-token': {
          type: 'string',
          description: 'Hugging Face token for gated repos (or HF_TOKEN)',
          placeholder: 'token',
        },
      },
      examples: ['atc models pull Qwen/Qwen3-8B-GGUF --quant Q4_K_M'],
    }),
    notImplemented({
      name: 'list',
      summary: 'Installed models',
      options: { loaded: { type: 'boolean', description: 'Only loaded models' } },
    }),
    notImplemented({
      name: 'rm',
      summary: 'Delete an installed model',
      positionals: [{ name: 'model', description: 'Model id', required: true }],
    }),
    notImplemented({
      name: 'info',
      summary: 'model.yml, size, capabilities and whether it fits',
      positionals: [{ name: 'model', description: 'Model id', required: true }],
    }),
  ],
})

export const enginesCommand = defineCommand({
  name: 'engines',
  summary: 'Engines that run models (llama.cpp, MLX, TensorRT-LLM) and their builds',
  description:
    'No engine ships inside atc: install one before `atc run`. The core knows the hardware and picks the build for it; an engine that runs in a container (TensorRT-LLM) gets that prepared on install, with consent for the one privileged step.',
  group: 'models',
  subcommands: [
    notImplemented({
      name: 'list',
      summary: 'Installed engines and builds, the running one, and what is available',
      options: {
        engine: { type: 'string', description: `Only this engine (${ENGINES})`, placeholder: 'engine' },
      },
    }),
    notImplemented({
      name: 'install',
      summary: 'Install an engine (the build the core recommends for this hardware)',
      description:
        'Shows what would change on the system before touching it; an engine that needs a container runtime or a driver setting asks first, elevates through sudo, pkexec or UAC, and resumes after a re-login or reboot.',
      positionals: [{ name: 'engine', description: `${ENGINES}; the default engine when omitted` }],
      options: {
        'build': {
          type: 'string',
          description: 'A specific build instead of the recommended one, e.g. b6000/cuda-cu12.4-x64',
          placeholder: 'build',
        },
        'force': { type: 'boolean', description: 'Reinstall' },
        'dry-run': { type: 'boolean', description: 'Print what would change and exit' },
        'resume': {
          type: 'string',
          description: 'Continue an install after a re-login or reboot',
          placeholder: 'operation-id',
        },
      },
      examples: ['atc engines install', 'atc engines install tensorrt-llm --dry-run'],
    }),
    notImplemented({
      name: 'status',
      summary: 'The running engine and build, driver facts, mismatch warnings',
    }),
    notImplemented({
      name: 'rm',
      summary: 'Remove an engine build, or the whole engine',
      positionals: [{ name: 'engine', description: ENGINES, required: true }],
      options: { build: { type: 'string', description: 'Only this build', placeholder: 'build' } },
    }),
  ],
})

export const hardwareCommand = defineCommand({
  name: 'hardware',
  summary: 'What the core sees of the GPU and CPU',
  group: 'models',
  subcommands: [
    notImplemented({ name: 'show', summary: 'GPUs, VRAM, driver, compute capability, CPU extensions' }),
    notImplemented({
      name: 'refresh',
      summary: 'Probe the hardware again',
      options: {
        'cpu-extensions': {
          type: 'string',
          description: 'Override, comma-separated (avx,avx2,avx512)',
          placeholder: 'list',
        },
      },
    }),
  ],
})

export const apiCommand = defineCommand({
  name: 'api',
  summary: 'The OpenAI-compatible API and its key',
  group: 'access',
  subcommands: [
    defineCommand({
      name: 'start',
      summary: 'Start the API, starting the daemon if needed',
      run: apiStart,
      options: {
        ...apiOptions,
        'prefix': { type: 'string', description: 'Path prefix', placeholder: '/v1' },
        'cors': { type: 'boolean', description: 'Send CORS headers', default: true },
        'trusted-host': {
          type: 'string',
          multiple: true,
          description: 'Extra Host value to accept',
          placeholder: 'host',
        },
      },
    }),
    defineCommand({ name: 'stop', summary: 'Stop the API', run: apiStop }),
    defineCommand({
      name: 'status',
      summary: 'Where the API listens and whether a key is required',
      run: apiStatus,
    }),
    defineCommand({
      name: 'key',
      summary: 'The API key (stored in the core settings)',
      subcommands: [
        notImplemented({
          name: 'show',
          summary: 'Print the key',
          options: { reveal: { type: 'boolean', description: 'Print it in full' } },
        }),
        notImplemented({
          name: 'set',
          summary: 'Set the key',
          positionals: [{ name: 'key', description: 'The key', required: true }],
        }),
        notImplemented({ name: 'rotate', summary: 'Generate a new key and restart the API' }),
        notImplemented({ name: 'clear', summary: 'Remove the key (loopback only)' }),
      ],
    }),
  ],
})
