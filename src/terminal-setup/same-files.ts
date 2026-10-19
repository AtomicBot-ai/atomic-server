import type { ModelSetupPlan } from './types.js'

/** The same bytes (hash and size): a new commit elsewhere in the repository is not a new file. */
export function sameFiles(a: ModelSetupPlan, b: ModelSetupPlan | undefined): boolean {
  const bytes = (p: ModelSetupPlan | undefined) =>
    [p?.model, p?.projector].map((f) => f && { file: f.file, sha256: f.sha256, size: f.size })
  return JSON.stringify(bytes(a)) === JSON.stringify(bytes(b))
}
