import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { canonicalizeExistingPrefix, isInside, sidecars } from './local.js'

/** Delete only a stopped job's files and resume sidecars, retaining files another job still owns. */
export async function discardDownloadFiles(
  root: string,
  files: readonly string[],
  retained: readonly string[] = []
): Promise<void> {
  const canonicalRoot = await canonicalizeExistingPrefix(root)
  const keep = new Set(
    await Promise.all(retained.map((path) => canonicalizeExistingPrefix(resolve(root, path))))
  )
  const paths: string[] = []
  // Validate the entire removal before touching any file, including symlinked ancestors.
  for (const path of [...new Set(files.map((file) => resolve(root, file)))]) {
    const canonical = await canonicalizeExistingPrefix(path)
    if (!isInside(canonical, canonicalRoot)) throw new Error('Download file is outside its storage folder.')
    if (!keep.has(canonical)) paths.push(path)
  }
  for (const path of paths) {
    for (const target of [path, ...Object.values(sidecars(path))]) await rm(target, { force: true })
    await rm(`${path}.segments`, { recursive: true, force: true })
  }
}
