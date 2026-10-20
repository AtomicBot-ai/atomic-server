/** The model download guided setup started for a managed engine or Foundry Local, kept to find it again. */

import { join } from 'node:path'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import type { EngineSetupJob } from './types.js'

export class SetupPathRecord {
  private readonly path: string
  constructor(directory: string) {
    this.path = join(directory, 'setup-path.json')
  }
  read(): Promise<EngineSetupJob | null> {
    return readDocument<EngineSetupJob | null>(this.path, null)
  }
  save(job: EngineSetupJob): Promise<void> {
    return writeDocument(this.path, job)
  }
  clear(): Promise<void> {
    return writeDocument(this.path, null)
  }
}
