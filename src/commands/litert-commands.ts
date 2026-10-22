/**
 * LiteRT-LM from `atc engines` (spec `litert-lm-server`, "Движок и ускоритель LiteRT-LM в atc"): the
 * accelerator the core offers this machine — `openvino` for an Intel NPU on Windows, nothing elsewhere —
 * and preparing it in the server, followed here by the core's `litert-lm:accelerators` events.
 */

import { AtcError } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import type { LiteRtAcceleratorsView } from '../contract/index.js'
import { formatSize } from '../workspace-view/index.js'
import { followPrepare } from './accelerator-prepare.js'
import { attachWorkspace } from './control.js'

const NOTHING =
  'LiteRT-LM has nothing to prepare here: its models run on the CPU and GPU without an accelerator.'
const OPS = { status: 'litert.accelerators', prepare: 'litert.prepare', event: 'litert-lm:accelerators' }

/**
 * Prepare `names` (else every accelerator not prepared) and follow it. `quiet`: after an install, where
 * a host with nothing to prepare (Linux, macOS) hears nothing about accelerators at all.
 */
export async function prepareLiteRtAccelerators(
  ctx: CommandContext,
  names: string[] = [],
  quiet = false
): Promise<number> {
  const { link, service } = await attachWorkspace(ctx)
  const view = (await service.execute(OPS.status)) as LiteRtAcceleratorsView
  const offered = view.accelerators.map((a) => a.name)
  const refused = names.filter((n) => !offered.includes(n))
  if (refused.length)
    throw new AtcError('ATC_USAGE', `LiteRT-LM offers no accelerator ${refused.join(', ')} here.`, {
      hint: offered.length ? `prepare one of: ${offered.join(', ')}` : 'nothing here needs preparing',
    })
  const wanted = names.length ? names : view.accelerators.filter((a) => !a.prepared).map((a) => a.name)
  if (wanted.length === 0 && !view.preparing) {
    if (!quiet) ctx.out.line(offered.length ? 'Every accelerator is prepared.' : NOTHING)
    return 0
  }
  return followPrepare<LiteRtAcceleratorsView>(ctx, link, service, OPS, wanted)
}

/** `atc engines accelerators litert-lm`: what the core offers here, prepared or not. */
export async function listLiteRtAccelerators(ctx: CommandContext): Promise<number> {
  const { service } = await attachWorkspace(ctx)
  const view = (await service.execute(OPS.status)) as LiteRtAcceleratorsView
  ctx.out.result(view, () => {
    if (view.error) ctx.out.note(view.error)
    if (!view.installed) ctx.out.line('LiteRT-LM is not installed: atc engines install litert-lm')
    ctx.out.line(`NPU: ${view.npu ?? 'none LiteRT-LM targets'}`)
    if (view.accelerators.length)
      ctx.out.table(
        [
          { header: 'ACCELERATOR' },
          { header: 'DEVICE' },
          { header: 'VERSION' },
          { header: 'SIZE' },
          { header: 'PREPARED' },
          { header: 'WHY NOT' },
        ],
        view.accelerators.map((a) => [
          a.name,
          a.device,
          a.version,
          formatSize(a.size_bytes),
          a.prepared ? 'yes' : 'no',
          a.reason ?? '',
        ])
      )
    else if (view.installed) ctx.out.line(NOTHING)
    if (view.preparing) ctx.out.note('a prepare is running in the server')
  })
  return 0
}
