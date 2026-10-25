import { join } from 'node:path'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import type { EngineSetupJob, SetupManifest } from './types.js'
/** A removed download must not return through an old terminal setup's Resume action. */
export async function forgetSetupDownload(directory: string, requestId: string) {
  const path = join(directory, 'setup.json'),
    manifest = await readDocument<SetupManifest | null>(path, null)
  if (manifest?.selections.some((selection) => selection.requestId === requestId))
    await writeDocument(path, {
      ...manifest,
      selections: manifest.selections.filter((selection) => selection.requestId !== requestId),
    })
  const jobPath = join(directory, 'setup-path.json'),
    job = await readDocument<EngineSetupJob | null>(jobPath, null)
  if (job?.id === requestId) await writeDocument(jobPath, null)
}
