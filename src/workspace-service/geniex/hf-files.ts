// File selection follows Atomic Chat's services/geniex/huggingface.ts (250aa30ae).
import type { GeniexHubFile } from './list.js'
export type GgufFileClass = { kind: 'model'; quantization: string } | { kind: 'mmproj' }

/** `-00001-of-00002`: one model split over several files, which the host does not load. */
const SHARD = /-\d{5}-of-\d{5}$/i

/**
 * What one file of a repository is, by its name: the model at one of `quantizations` (as conf spells
 * them; the name's case does not matter, Google's QAT files say `q4_0`), the projector, or nothing
 * the Hub offers.
 */
export function classifyGgufFile(path: string, quantizations: readonly string[]): GgufFileClass | null {
  const name = path.split('/').at(-1) ?? ''
  if (!/\.gguf$/i.test(name)) return null
  const stem = name.slice(0, -'.gguf'.length)
  if (SHARD.test(stem)) return null
  if (/mmproj/i.test(stem)) return { kind: 'mmproj' }
  const tokens = stem.split(/[-_.]/).map((token) => token.toUpperCase())
  for (const quantization of quantizations) {
    // A quantization is itself `_`-joined (`Q4_K_M`): its parts must follow each other in the name.
    const parts = quantization.toUpperCase().split('_')
    for (let start = 0; start + parts.length <= tokens.length; start++) {
      if (parts.every((part, index) => tokens[start + index] === part)) {
        return { kind: 'model', quantization }
      }
    }
  }
  return null
}

/** A file as Hugging Face's revision answer lists it. */
export interface HfSibling {
  rfilename: string
  size?: number | null
  lfs?: { sha256?: string; size?: number } | null
}

export interface HfGgufPick {
  quantization: string
  file: GeniexHubFile
  mmproj?: GeniexHubFile
}

const asFile = (sibling: HfSibling): GeniexHubFile | null => {
  const sha256 = sibling.lfs?.sha256
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null
  const size = Number(sibling.lfs?.size ?? sibling.size ?? 0)
  if (!Number.isInteger(size) || size <= 0) return null
  return { path: sibling.rfilename, size, sha256 }
}

/**
 * The model file to offer — the first of `quantizations` the repository has, with its LFS size and
 * sha256 — and the projector beside it (an F16 one when there are several). `null` when the
 * repository has no such file, or only one without LFS metadata.
 */
export function hfGgufFiles(
  siblings: readonly HfSibling[],
  quantizations: readonly string[]
): HfGgufPick | null {
  const models = new Map<string, GeniexHubFile>()
  const projectors: GeniexHubFile[] = []
  for (const sibling of siblings) {
    const kind = classifyGgufFile(sibling.rfilename, quantizations)
    if (!kind) continue
    const file = asFile(sibling)
    if (!file) continue
    if (kind.kind === 'mmproj') projectors.push(file)
    else if (!models.has(kind.quantization)) models.set(kind.quantization, file)
  }
  const quantization = quantizations.find((q) => models.has(q))
  if (!quantization) return null
  const mmproj = projectors.find((file) => /f16/i.test(file.path)) ?? projectors[0]
  return {
    quantization,
    file: models.get(quantization) as GeniexHubFile,
    ...(mmproj ? { mmproj } : {}),
  }
}
