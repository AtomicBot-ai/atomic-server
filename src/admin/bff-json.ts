import { AtcError } from '../errors/index.js'
export const MAX_BODY_BYTES = 8 * 1024 * 1024

export async function readJson(req: AsyncIterable<Uint8Array>, limit = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new AtcError('ATC_USAGE', 'Request body too large.')
    chunks.push(Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new AtcError('ATC_USAGE', 'Request body is not valid JSON.')
  }
}
