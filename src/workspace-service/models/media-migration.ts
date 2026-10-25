/**
 * Image and video files an earlier atc kept under `workspace-models/<image|video>/<family>` move to
 * `diffusion/models/<family>`, the folder the core lists, loads from and deletes in (and the desktop
 * app downloads into). Partials move with their sidecars, so a download resumes where it stopped.
 *
 * Folders move first; the records are then rewritten from what is on disk — a family whose old folder
 * is gone and whose new one exists — so a crash between the two is finished on the next start. A
 * family the destination already has stays where it was, records unchanged.
 */
import { mkdir, readdir, rename, rmdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { readDocument, writeDocument } from '../../terminal-data/index.js'

const CATEGORIES = ['image', 'video'] as const
const OLD_ROOT = 'workspace-models'
const NEW_ROOT = ['diffusion', 'models'] as const

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  )

/** `kept`: `<category>/<family>` folders left in place because the destination already had them. */
export async function migrateMediaFolders(
  dataFolder: string,
  recordsDir: string
): Promise<{ kept: string[] }> {
  const kept: string[] = []
  for (const category of CATEGORIES) {
    const root = join(dataFolder, OLD_ROOT, category)
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue
      const to = join(dataFolder, ...NEW_ROOT, entry.name)
      if (await exists(to)) {
        kept.push(`${category}/${entry.name}`)
        continue
      }
      await mkdir(join(dataFolder, ...NEW_ROOT), { recursive: true })
      await rename(join(root, entry.name), to)
    }
    await rmdir(root).catch(() => undefined) // only when empty
  }
  await rmdir(join(dataFolder, OLD_ROOT)).catch(() => undefined)
  await rewriteRecords(dataFolder, recordsDir)
  return { kept }
}

async function rewriteRecords(dataFolder: string, recordsDir: string) {
  const moved = new Map<string, Promise<boolean>>()
  const isMoved = (category: string, family: string) => {
    const key = `${category}/${family}`
    if (!moved.has(key))
      moved.set(
        key,
        Promise.all([
          exists(join(dataFolder, OLD_ROOT, category, family)),
          exists(join(dataFolder, ...NEW_ROOT, family)),
        ]).then(([old, now]) => !old && now)
      )
    return moved.get(key)!
  }
  const absRoot = join(dataFolder, OLD_ROOT) + sep
  const relocate = async (value: string): Promise<string> => {
    const rel = new RegExp(`^${OLD_ROOT}/(${CATEGORIES.join('|')})/([^/]+)/`).exec(value)
    if (rel && (await isMoved(rel[1]!, rel[2]!)))
      return `${NEW_ROOT.join('/')}/${rel[2]}/${value.slice(rel[0].length)}`
    if (!value.startsWith(absRoot)) return value
    const [category, family, ...rest] = value.slice(absRoot.length).split(sep)
    if (!category || !family || !(CATEGORIES as readonly string[]).includes(category)) return value
    return (await isMoved(category, family)) ? join(dataFolder, ...NEW_ROOT, family, ...rest) : value
  }
  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') return relocate(value)
    if (Array.isArray(value)) return Promise.all(value.map(walk))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await walk(v)] as const))
      )
    return value
  }
  for (const name of await readdir(recordsDir).catch(() => [])) {
    if (!name.endsWith('.json')) continue
    const path = join(recordsDir, name)
    const record = await readDocument<unknown>(path, null)
    if (record === null) continue
    const next = await walk(record)
    if (JSON.stringify(next) !== JSON.stringify(record)) await writeDocument(path, next)
  }
}
