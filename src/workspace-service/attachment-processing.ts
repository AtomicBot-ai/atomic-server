import { AtcError } from '../errors/index.js'
import type { AttachmentSettings } from '../contract/index.js'
/** Deterministic lexical retrieval for supported text documents; no document text is executed. */
export function prepareDocument(settings: AttachmentSettings, name: string, content: string, query: string) {
  if (!settings.enabled) throw new AtcError('ATC_USAGE', 'Enable document attachments in Settings first.')
  if (Buffer.byteLength(content) > settings.max_file_size_mb * 1024 * 1024)
    throw new AtcError('ATC_USAGE', `Document exceeds ${settings.max_file_size_mb} MB.`)
  if (content.includes('\0'))
    throw new AtcError('ATC_USAGE', 'Choose a text document. Binary documents must be converted to text.')
  const retrieval =
    settings.parse_mode === 'retrieval' ||
    (settings.parse_mode === 'auto' && content.length > settings.chunk_size_chars * settings.retrieval_limit)
  if (!retrieval) return { name, content, mode: 'inline', chunks: 1 }
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])]
  const chunks: { at: number; text: string; score: number }[] = []
  for (let at = 0; at < content.length; at += settings.chunk_size_chars - settings.overlap_chars) {
    const text = content.slice(at, at + settings.chunk_size_chars),
      lower = text.toLowerCase()
    const score = terms.length ? terms.filter((term) => lower.includes(term)).length / terms.length : 1
    if (score >= settings.retrieval_threshold) chunks.push({ at, text, score })
  }
  const selected = chunks
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, settings.retrieval_limit)
    .sort((a, b) => a.at - b.at)
  return {
    name,
    content: selected.map((item) => `[${name}, character ${item.at + 1}]\n${item.text}`).join('\n\n'),
    mode: 'retrieval',
    chunks: selected.length,
  }
}
