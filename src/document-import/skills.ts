import { zipSync, strToU8 } from 'fflate'
import { readArchive } from './archive.js'
export function importSkillPackage(bytes: Uint8Array) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Choose a skill package smaller than 10 MB.')
  const files = readArchive(bytes)
  const entries = [...files.keys()].filter((name) => /(^|\/)SKILL\.md$/.test(name))
  if (entries.length !== 1) throw new Error('A skill package must contain exactly one SKILL.md.')
  const entry = entries[0]!,
    prefix = entry.slice(0, -8)
  const resources: Record<string, string> = {}
  let size = 0
  for (const [name, data] of files) {
    if (name.endsWith('/') || name === entry) continue
    if (!name.startsWith(prefix)) throw new Error('Keep skill resources inside the skill folder.')
    size += data.length
    if (size > 10 * 1024 * 1024) throw new Error('Skill resources exceed 10 MB.')
    resources[name.slice(prefix.length)] = Buffer.from(data).toString('base64')
  }
  return { content: new TextDecoder('utf-8', { fatal: true }).decode(files.get(entry)!), resources }
}
export function exportSkillPackage(content: string, resources: Record<string, string> = {}): string {
  const files: Record<string, Uint8Array> = { 'SKILL.md': strToU8(content) }
  for (const [name, data] of Object.entries(resources))
    files[name] = new Uint8Array(Buffer.from(data, 'base64'))
  return Buffer.from(zipSync(files)).toString('base64')
}
