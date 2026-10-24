import type { AttachmentSettings } from '../contract/index.js'
import { prepareDocument } from './attachment-processing.js'
export type EmbedDocuments = (input: string[], model: string) => Promise<number[][]>
/** Exact cosine search over document chunks; the core's public embeddings API owns inference. */
export async function prepareAttachment(
  settings: AttachmentSettings,
  name: string,
  content: string,
  query: string,
  embed?: EmbedDocuments
) {
  // Run shared byte/binary/enabled validation before allocating chunks or asking the engine to work.
  prepareDocument({ ...settings, parse_mode: 'inline' }, name, content, query)
  const mode =
    settings.parse_mode === 'auto'
      ? content.length <= 32768 * settings.auto_inline_context_ratio
        ? 'inline'
        : 'embeddings'
      : settings.parse_mode
  if (mode === 'inline' || mode === 'retrieval')
    return prepareDocument({ ...settings, parse_mode: mode }, name, content, query)
  if (!embed) throw new Error('Start an embedding model before using document retrieval.')
  const chunks: string[] = []
  for (let at = 0; at < content.length; at += settings.chunk_size_chars - settings.overlap_chars)
    chunks.push(content.slice(at, at + settings.chunk_size_chars))
  if (chunks.length > 10000)
    throw new Error('This document produces too many chunks. Increase the chunk size or split the document.')
  const vectors: number[][] = []
  for (let index = 0; index < chunks.length; index += 32)
    vectors.push(...(await embed(chunks.slice(index, index + 32), settings.embedding_model)))
  const [question] = await embed([query || name], settings.embedding_model)
  if (!question?.length || vectors.length !== chunks.length)
    throw new Error('Embedding model returned an incomplete result.')
  const magnitude = (v: number[]) => Math.sqrt(v.reduce((sum, n) => sum + n * n, 0))
  const norm = magnitude(question)
  const matches = vectors
    .map((vector, index) => {
      if (vector.length !== question.length || vector.some((n) => !Number.isFinite(n)))
        throw new Error('Embedding model returned invalid vectors.')
      const denominator = norm * magnitude(vector)
      return {
        index,
        score: denominator ? vector.reduce((sum, n, i) => sum + n * question[i]!, 0) / denominator : 0,
      }
    })
    .filter((item) => item.score >= settings.retrieval_threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, settings.retrieval_limit)
    .sort((a, b) => a.index - b.index)
  return {
    name,
    mode: 'embeddings',
    chunks: matches.length,
    content: matches
      .map((item) => `[${name}, excerpt ${item.index + 1}]\n${chunks[item.index]}`)
      .join('\n\n'),
  }
}
