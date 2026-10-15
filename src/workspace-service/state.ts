import { join } from 'node:path'
import type { AtcPaths } from '../config/index.js'
import type { WorkspaceSnapshot } from '../contract/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
export function readWorkspaceSetup(paths: AtcPaths): Promise<WorkspaceSnapshot['setup']> {
  return readDocument(join(paths.atcDir, 'workspace-setup.json'), null)
}
export async function saveWorkspaceSetup(paths: AtcPaths, mode: 'manual' | 'guided') {
  const state = { mode, complete: true, updated_at: Date.now() }
  await writeDocument(join(paths.atcDir, 'workspace-setup.json'), state)
  return state
}
