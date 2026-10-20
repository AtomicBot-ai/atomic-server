/**
 * Foundry Local's sources on loopback, for tests of its model downloads: conf's list with one curated
 * model (`gemma-4-e2b-it`, an OpenVINO NPU and a CPU variant), the resolver of one region, and the
 * Azure Blob container a resolution names (`?sig=<n>`), serving each variant's files under `v3/`.
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import type { FixtureHttpServer } from './fixture-http-server.js'

export const GEMMA_TEMPLATE =
  "{%- set function = tool_call['function'] -%}\n{{- tool['function']['name'] -}}\n"
export const WEIGHTS = Buffer.alloc(600_000, 3)
export const ASSET = (v: string) => `azureml://registries/azureml/models/gemma-4-e2b-it-${v}/versions/3`
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** conf's list, written to `path`; returns its `file://` URL (what `ATC_FOUNDRY_LOCAL_MODELS_URL` takes). */
export function confList(path: string, base: string): string {
  const variant = (id: string, device: string, ep: string) => ({
    id: `gemma-4-e2b-it-${id}`,
    device,
    execution_provider: ep,
    platforms: ['win-x64', 'linux-x64', 'linux-arm64', 'macos-arm64'],
    source: { kind: 'azureml', asset_id: ASSET(id), version: '3', path_prefix: 'v3' },
    files: [
      { path: 'model.onnx', size: WEIGHTS.length, sha256: sha(WEIGHTS) },
      {
        path: 'chat_template.jinja',
        size: Buffer.byteLength(GEMMA_TEMPLATE),
        sha256: sha(Buffer.from(GEMMA_TEMPLATE)),
      },
    ],
  })
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: 1,
      updated_at: '2026-10-20T00:00:00Z',
      resolver: {
        url_template: `${base}/{region}/resolve?assetId={asset_id}`,
        regions: ['eastus', 'westeurope'],
      },
      catalog: { url: `${base}/catalog` },
      models: [
        {
          id: 'gemma-4-e2b-it',
          name: 'Gemma 4 E2B',
          description: 'Google Gemma 4.',
          task: 'chat',
          license: 'gemma',
          context_length: 32768,
          tools: true,
          reasoning: false,
          variants: [variant('openvino-npu', 'npu', 'openvino'), variant('generic-cpu', 'cpu', 'cpu')],
        },
      ],
    })
  )
  return pathToFileURL(path).href
}

/** The resolver names container `sig` for variant `id`, which serves its files under `v3/`. */
export function serveAzure(azure: FixtureHttpServer, base: string, id: string, sig: string): void {
  const json = (v: unknown) => ({ body: Buffer.from(JSON.stringify(v)) })
  azure.files.set(
    `/eastus/resolve?assetId=${encodeURIComponent(ASSET(id))}`,
    json({ blobSasUri: `${base}/container?sig=${sig}`, modelEntity: { kvTags: { directoryPath: 'v3' } } })
  )
  azure.files.set(`/container/v3/model.onnx?sig=${sig}`, { body: WEIGHTS })
  azure.files.set(`/container/v3/chat_template.jinja?sig=${sig}`, { body: Buffer.from(GEMMA_TEMPLATE) })
}

/** The core's verdict on a variant by device (`ok` unless named), as `POST /models/foundry-local/check`. */
export const foundryCheck =
  (verdicts: Record<string, string> = {}) =>
  (body: unknown) => {
    const { device } = body as { device: string }
    const verdict = verdicts[device] ?? 'ok'
    return { verdict, reason: verdict === 'ok' ? null : `${device}: ${verdict}`, accelerator: null }
  }
