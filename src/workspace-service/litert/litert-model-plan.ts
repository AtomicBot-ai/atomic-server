/**
 * What downloading a LiteRT-LM variant would do (spec `litert-lm-server`, "Модели LiteRT-LM в atc"): the
 * variant — named, else by `--backend`, else NPU, GPU, CPU among those the core says run (`ok`) or will
 * once prepared — with the core's verdict; its one `.litertlm` file pinned to a commit with size and
 * sha256; the room in the data folder. Only an `ok` verdict downloads, and a gated repository only with
 * the server's `HF_TOKEN`: both are blockers here, before a byte is written.
 */

import { createHash } from 'node:crypto'
import type { LiteRtModelPlan, LiteRtModelRow, LiteRtVariantRow } from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { HF_HUB } from '../models/hf-revision.js'
import { liteRtSearch } from './litert-catalog.js'
import type { LiteRtSearchDeps } from './litert-catalog.js'
import type { StoreFiles } from '../managed/managed-model-plan.js'
import { underRoot } from '../managed/managed-model-plan.js'

export interface LiteRtPlanDeps extends LiteRtSearchDeps {
  /** `<data>/litert-lm/models`. */
  modelsDir: string
  files: StoreFiles
}

const HINTS: Record<string, string> = {
  'accelerator-not-prepared': 'atc engines accelerators litert-lm --prepare',
  'engine-not-installed': 'atc engines install litert-lm',
}
const ORDER: Record<string, number> = { npu: 0, gpu: 1, cpu: 2 }
const usable = (v: LiteRtVariantRow) =>
  v.verdict.verdict === 'ok' || v.verdict.verdict === 'accelerator-not-prepared'

/** The file's name inside the variant folder: its name in the repository. */
export const liteRtFileName = (path: string) => path.split('/').at(-1) ?? path

/** What a person asks the Hub for to find `model`: a repository's name, or a variant id's model part. */
const hubQuery = (model: string) =>
  model.includes('/') ? (model.split('/')[1] ?? model) : model.replace(/-(cpu|gpu|npu)(-intel-\w+)?$/, '')

async function findModel(d: LiteRtSearchDeps, model: string, named: string) {
  const owns = (m: LiteRtModelRow) =>
    m.model_id.toLowerCase() === model.toLowerCase() || m.variants.some((v) => v.id === named)
  const curated = await liteRtSearch(d, { huggingface: false })
  const found = curated.models.find(owns)
  if (found) return { platform: curated.platform, model: found }
  const searched = await liteRtSearch(d, { query: hubQuery(model), huggingface: true })
  return { platform: searched.platform, model: searched.models.find(owns) }
}

export async function liteRtModelPlan(
  d: LiteRtPlanDeps,
  input: { model: string; variant?: string; backend?: string }
): Promise<LiteRtModelPlan> {
  const named = input.variant ?? input.model
  const { platform, model } = await findModel(d, input.model, named)
  if (!model)
    throw new AtcError('ATC_USAGE', `No LiteRT-LM model or variant ${input.model} for ${platform}.`, {
      hint: 'see atc models search --engine litert-lm',
    })
  const variant =
    model.variants.find((v) => v.id === named) ??
    (input.backend
      ? [...model.variants]
          .filter((v) => v.backend === input.backend)
          .sort((a, b) => Number(usable(b)) - Number(usable(a)))[0]
      : model.variants.filter(usable).sort((a, b) => ORDER[a.backend]! - ORDER[b.backend]!)[0])
  if (!variant) {
    const hinted = model.variants.find((v) => HINTS[v.verdict.verdict])
    throw new AtcError(
      'ATC_USAGE',
      `${model.name} has no variant${input.backend ? ` for the ${input.backend}` : ''} that runs here.`,
      {
        details: model.variants.map((v) => `${v.id}: ${v.verdict.verdict}`).join('; '),
        ...(hinted ? { hint: HINTS[hinted.verdict.verdict] } : {}),
      }
    )
  }
  const blockers: string[] = []
  if (variant.verdict.verdict !== 'ok') {
    const hint = HINTS[variant.verdict.verdict]
    blockers.push(
      `${variant.id}: ${variant.verdict.reason ?? variant.verdict.verdict}${hint ? ` (${hint})` : ''}`
    )
  }
  if (model.gated && !d.token)
    blockers.push(
      `${model.name} is gated: accept its terms at ${HF_HUB}/${model.repo}, then set HF_TOKEN in the server's environment and restart it.`
    )
  const dir = underRoot(d.modelsDir, variant.id)
  const present =
    (await d.files.size(underRoot(dir, liteRtFileName(variant.file.path)))) === variant.file.size
  const download = present ? 0 : variant.file.size
  const free = await d.link.disk.available(d.modelsDir).catch(() => null)
  if (free !== null && download > free) blockers.push(`Not enough free space for ${variant.id}.`)
  return {
    digest: createHash('sha256')
      .update(
        JSON.stringify({
          variant: variant.id,
          repo: model.repo,
          revision: model.revision,
          file: variant.file,
        })
      )
      .digest('hex'),
    origin: model.origin,
    model_id: model.model_id,
    name: model.name,
    variant_id: variant.id,
    backend: variant.backend,
    ...(variant.npu ? { npu: variant.npu } : {}),
    repo: model.repo,
    revision: model.revision,
    gated: model.gated,
    unverified: model.unverified,
    file: variant.file,
    verdict: variant.verdict,
    dir,
    present,
    download_bytes: download,
    free_bytes: free,
    record: {
      ...(model.context_length ? { context_length: model.context_length } : {}),
      tools: model.tools ?? false,
      reasoning: model.reasoning ?? false,
      vision: model.vision ?? false,
    },
    blockers,
  }
}
