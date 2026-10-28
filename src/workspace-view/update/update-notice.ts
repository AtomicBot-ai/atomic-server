import type { WorkspaceAtc } from '../../contract/index.js'

/** One line saying a newer atc is out and how to get it; null while there is nothing to say. */
export function updateNotice(atc: WorkspaceAtc | undefined): string | null {
  if (!atc?.update) return null
  const how = atc.update.command ? `run \`${atc.update.command}\`` : atc.update.url
  return `atc ${atc.update.version} is out (you run ${atc.version}): ${how}`
}
