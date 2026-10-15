/**
 * Installing a model is the client's job (the desktop app does it in Rust): resolve, check disk
 * through the core, download with resume and sha256, write `model.yml`, report progress. The
 * implementation uses atc's own downloader (`src/downloads/`; the core downloads no model files since
 * 0.17.0) in iteration 3; this is the seam commands and the admin call.
 */

import { AtcError } from '../errors/index.js'
import type { ResolvedModel } from './resolver.js'

export interface InstallProgress {
  taskId: string
  modelId: string
  transferred: number
  total: number | undefined
  stage: 'connecting' | 'downloading' | 'verifying' | 'retrying'
}

export interface InstallOptions {
  onProgress?: (progress: InstallProgress) => void
  signal?: AbortSignal
}

export interface InstalledModel {
  modelId: string
  path: string
  sizeBytes: number
}

export interface ModelInstaller {
  install(model: ResolvedModel, options?: InstallOptions): Promise<InstalledModel>
  cancel(taskId: string): Promise<boolean>
  list(): Promise<InstalledModel[]>
  remove(modelId: string): Promise<void>
}

export function notImplementedInstaller(): ModelInstaller {
  const fail = () =>
    Promise.reject(
      new AtcError('ATC_NOT_IMPLEMENTED', 'Model installation is not implemented yet.', {
        details: 'planned for iteration 3 (models: catalog, pull, list, rm; API keys)',
      })
    )
  return { install: fail, cancel: fail, list: fail, remove: fail }
}
