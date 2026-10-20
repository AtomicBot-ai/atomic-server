/**
 * The `atc models` subcommands for the managed engines' checkpoints (spec `managed-models-server`):
 * the core's verdict before any download.
 */

import { defineCommand } from '../cli/index.js'
import type { ModelCheckResult } from '../contract/index.js'
import { verdictLine } from '../workspace-view/index.js'
import { workspace } from './control.js'

export const checkModelCommand = defineCommand({
  name: 'check',
  summary: "Each managed engine's verdict on a Hugging Face model, before downloading it",
  positionals: [{ name: 'repo', description: 'owner/repo[@revision]', required: true }],
  options: { engine: { type: 'string', description: 'Only this managed engine', placeholder: 'engine' } },
  examples: [
    'atc models check Qwen/Qwen3.5-2B',
    'atc models check nvidia/Qwen3-8B-FP8@main --engine tensorrt-llm',
  ],
  run: async (inv, ctx) => {
    const [repository, revision] = splitRevision(inv.positionals[0]!)
    const result = (await (
      await workspace(ctx)
    ).execute('models.check', {
      repository,
      ...(revision ? { revision } : {}),
      ...(typeof inv.values['engine'] === 'string' ? { engine: inv.values['engine'] } : {}),
    })) as ModelCheckResult
    ctx.out.result(result, () => {
      ctx.out.note(`${result.repository} at ${result.revision}`)
      for (const v of result.verdicts) ctx.out.line(verdictLine(v))
    })
    return 0
  },
})

/** `owner/repo@revision` → the repository and the revision, when there is one. */
export function splitRevision(ref: string): [string, string | undefined] {
  const at = ref.lastIndexOf('@')
  return at > 0 ? [ref.slice(0, at), ref.slice(at + 1)] : [ref, undefined]
}
