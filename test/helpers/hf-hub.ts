/**
 * Hugging Face on loopback for managed-model tests: one repository served the way the Hub answers
 * it — the revision listing (`main` and the commit itself) with sizes and LFS sha256, and every file
 * under `resolve/<commit>/`, with ranges. Weight files are real safetensors (a header, then bytes), so
 * reading their tensor names and verifying a download both work on what is served.
 */
import { createHash } from 'node:crypto'
import type { FixtureHttpServer } from './fixture-http-server.js'

export const HF_SHA = 'c0ffee' + '0'.repeat(34)

/** A safetensors file: its 8-byte little-endian header length, the JSON header, then the weights. */
export function safetensors(names: string[], weightBytes = 64): Buffer {
  const header = Buffer.from(
    JSON.stringify({
      __metadata__: { format: 'pt' },
      ...Object.fromEntries(names.map((n) => [n, { dtype: 'BF16', shape: [2, 2], data_offsets: [0, 8] }])),
    })
  )
  const length = Buffer.alloc(8)
  length.writeBigUInt64LE(BigInt(header.length))
  return Buffer.concat([length, header, Buffer.alloc(weightBytes, 7)])
}

/** What a small Qwen-like repository holds: config, tokenizer, two weight shards. */
export function qwenFiles(config: Record<string, unknown> = {}): Record<string, Buffer> {
  return {
    'config.json': Buffer.from(JSON.stringify({ architectures: ['Qwen3ForCausalLM'], ...config })),
    'tokenizer.json': Buffer.from('{"version":"1.0"}'),
    'model-00001-of-00002.safetensors': safetensors(['model.layers.0.self_attn.q_proj.weight'], 4096),
    'model-00002-of-00002.safetensors': safetensors(
      ['model.layers.1.self_attn.q_proj.weight', 'lm_head.weight'],
      2048
    ),
  }
}

/** Serve `files` as `repository` at commit `HF_SHA`; returns what the listing says of each file. */
export function serveRepository(
  server: FixtureHttpServer,
  repository: string,
  files: Record<string, Buffer>,
  options: { revisions?: string[]; gated?: number } = {}
) {
  const siblings = Object.entries(files).map(([path, body]) => {
    const lfs = path.endsWith('.safetensors')
    const sha256 = createHash('sha256').update(body).digest('hex')
    return lfs
      ? { rfilename: path, size: 134, lfs: { sha256, size: body.length } }
      : { rfilename: path, size: body.length }
  })
  const listing = { body: Buffer.from(JSON.stringify({ sha: HF_SHA, siblings })) }
  for (const revision of options.revisions ?? ['main', HF_SHA]) {
    const path = `/api/models/${repository}/revision/${revision}?blobs=true&files_metadata=true`
    server.files.set(
      path,
      options.gated
        ? { body: Buffer.from('{"error":"gated"}'), failStatus: options.gated, failTimes: 99 }
        : listing
    )
  }
  for (const [path, body] of Object.entries(files))
    server.files.set(`/${repository}/resolve/${HF_SHA}/${path}`, { body })
  return siblings
}
