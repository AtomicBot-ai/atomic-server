/** A fake Hub and core for ModelSetups tests: file bodies with Range, verdicts, the PrismML catalog. */
import { createHash } from 'node:crypto'
import { Downloader } from '../../src/downloads/index.js'
import type { ModelSetup, ModelSetupPlan } from '../../src/contract/index.js'
import { ModelSetups } from '../../src/workspace-service/models/model-setups.js'
import { fakeCoreLink } from './fake-core-link.js'
import { tmpDataFolder } from './tmp-data-folder.js'
import { waitFor } from './wait-for.js'

export const weights = Buffer.alloc(256 * 1024, 3)
const sha = createHash('sha256').update(weights).digest('hex')
const projector = Buffer.from('projector bytes')
export const cleanup: Array<() => void> = []

/** The Hub: the repo listing, then file bodies with Range; `hold` stops a body halfway until released. */
function hub() {
  const state = { hold: false, release: () => {}, ranges: [] as string[] }
  const request: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/api/models/'))
      return Response.json({
        siblings: [
          {
            rfilename: 'model.Q4_K_M.gguf',
            size: weights.length,
            lfs: { sha256: sha, size: weights.length },
          },
        ],
      })
    const body = url.endsWith('mmproj.gguf') ? projector : weights
    const range = new Headers(init?.headers).get('range')
    if (range) state.ranges.push(range)
    const start = Number(/bytes=(\d+)-/.exec(range ?? '')?.[1] ?? 0)
    const slice = body.subarray(start)
    const half = slice.subarray(0, Math.floor(slice.length / 2))
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (!state.hold || body === projector) {
          controller.enqueue(new Uint8Array(slice))
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(half))
        await new Promise<void>((resolve) => (state.release = resolve))
        controller.enqueue(new Uint8Array(slice.subarray(half.length)))
        controller.close()
      },
    })
    init?.signal?.addEventListener('abort', () => state.release())
    return new Response(stream, {
      status: range ? 206 : 200,
      headers: {
        'content-length': String(slice.length),
        ...(range ? { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
      },
    })
  }
  return { state, request }
}

export function fixture(core: { prism?: boolean; verdictAfter?: string } = {}) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  const { state, request } = hub()
  const packs: Array<{ version: string; backend: string }> = []
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    const input = (body ?? {}) as Record<string, unknown>
    if (path === '/models/atomic-prism/families')
      return {
        families: core.prism
          ? [
              {
                id: 'bonsai',
                title: 'Bonsai',
                repo: 'prism-ml/Bonsai-gguf',
                revision: 'pinned',
                files: [
                  {
                    file: 'Bonsai-Q1_0.gguf',
                    size: weights.length,
                    sha256: sha,
                    treatment: 'prism_required',
                  },
                ],
                projectors: [
                  {
                    file: 'mmproj.gguf',
                    size: projector.length,
                    sha256: createHash('sha256').update(projector).digest('hex'),
                    default: true,
                  },
                ],
              },
            ]
          : [],
      } as T
    if (path === '/models/compatibility') {
      const onDisk = typeof input['model_id'] === 'string'
      if (onDisk && core.verdictAfter === 'throw') throw new Error('The core answered 500.')
      // A server that stops mid-check: the verdict never comes.
      if (onDisk && core.verdictAfter === 'hang') return new Promise<T>(() => {})
      const outcome = onDisk
        ? (core.verdictAfter ?? 'compatible')
        : core.prism
          ? 'engine_required'
          : 'compatible'
      return {
        outcome,
        provider: core.prism ? 'atomic-prism' : null,
        requires: core.prism ? ['q1_0'] : [],
        evidence: 'header',
        rules_version: 1,
        reason: outcome === 'compatible' ? 'fine' : 'The file needs another engine.',
        ...(core.prism ? { min_prism_build: 2, family: 'bonsai' } : {}),
      } as T
    }
    if (path === '/backends/atomic-prism/catalog')
      return {
        available: [{ version: 'prism-b3-abcdef0', backend: 'cpu' }],
        installed: packs,
        recommended: 'prism-b3-abcdef0/cpu',
        recommended_installed: null,
        releases: [{ tag: 'prism-b3-abcdef0', variants: [{ id: 'cpu', size: 10 }] }],
      } as T
    if (path === '/backends/atomic-prism/install') packs.push({ version: 'prism-b3-abcdef0', backend: 'cpu' })
    return {} as T
  }
  const downloader = new Downloader({
    dataFolder: tmp.paths.dataFolder,
    platform: 'linux',
    fetch: request,
    availableSpace: async () => undefined,
  })
  const make = () =>
    new ModelSetups({ link, paths: tmp.paths, downloader, fetch: request, env: { HF_TOKEN: 'hf_secret' } })
  return { tmp, link, hub: state, make, downloader }
}
export const settle = async (setups: ModelSetups, id: string, stages = ['ready', 'failed', 'cancelled']) => {
  let record: ModelSetup | undefined
  // Shorter than a test's own timeout, so a setup that never gets there says where it stopped and why.
  await waitFor(async () => {
    record = await setups.get(id)
    return stages.includes(record.stage)
  }, 3500).catch(() => {
    throw new Error(
      `setup ${id} stayed '${record?.stage}' (stopped at ${record?.stopped_at ?? '-'}): ${record?.error?.message ?? 'no error recorded'}`
    )
  })
  return record as ModelSetup
}
/** A finished setup's stage and error together, so a failed one shows why in the test's diff. */
export const outcome = (record: ModelSetup) => ({ stage: record.stage, error: record.error?.message })
export const install = async (setups: ModelSetups, repo: string, file: string, requestId = 'req-1') => {
  const plan = (await setups.plan({ repo, file })) as ModelSetupPlan
  return setups.install({ request: { repo, file }, plan_digest: plan.digest, request_id: requestId })
}
