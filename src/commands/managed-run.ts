/**
 * `atc run` with the stages of a load (design D8): the command listens to `session:load-progress` of
 * this provider and model before it asks for the load, prints each stage with its elapsed time (NDJSON
 * with `--json`), cancels the load on Ctrl-C, and prints the tail of the last attempt's log when the
 * load fails. A provider without stages (llama.cpp, Foundry Local) just waits for the answer. For a
 * model of the managed store the engine is the one named, the default when it lists the model, or the
 * one installed engine that does; several are a usage error that names them. A downloaded Foundry Local
 * variant goes to `foundry-local`.
 */

import type { CoreEventMessage } from '@atomic-chat/core/client'
import type { CommandContext } from '../cli/index.js'
import { AtcError } from '../cli/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { loadStageText } from '../workspace-view/index.js'
import { attachWorkspace } from './control.js'

const SUBSCRIBE_WAIT_MS = 3000
const LAST_STAGE_WAIT_MS = 300

interface StoreRow {
  id: string
  store?: string
  providers?: string[]
}

/** The engine a store model or Foundry Local variant goes to when none is named; else `undefined`. */
async function storeEngine(
  service: WorkspaceClient,
  model: string,
  fallback: string
): Promise<string | undefined> {
  const rows = (await service.execute('models.installed')) as StoreRow[]
  if (rows.some((m) => m.id === model && m.store === 'foundry-local')) return 'foundry-local'
  const row = rows.find((m) => m.id === model && m.store === 'managed')
  if (!row) return undefined
  const providers = row.providers ?? []
  if (providers.includes(fallback)) return fallback
  const environments = (await service.execute('environments.list')) as Array<{
    installations?: Array<{ engine_id: string; status: string }>
  }>
  const installed = new Set(
    (environments[0]?.installations ?? []).filter((i) => i.status === 'ready').map((i) => i.engine_id)
  )
  const candidates = providers.filter((p) => installed.has(p))
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1)
    throw new AtcError('ATC_USAGE', `Several installed engines run ${model}: ${candidates.join(', ')}.`, {
      hint: `name one with --engine (${candidates.map((c) => `atc run ${model} --engine ${c}`).join(' or ')})`,
    })
  return undefined
}

export async function runModel(
  ctx: CommandContext,
  model: string,
  values: Record<string, unknown>,
  choose: (service: WorkspaceClient) => Promise<string>
): Promise<number> {
  const { link, service } = await attachWorkspace(ctx)
  const named = typeof values['engine'] === 'string' ? values['engine'] : undefined
  const provider =
    named ??
    (await storeEngine(service, model, (await ctx.config()).values.engines.default)) ??
    (await choose(service))
  const input = {
    provider,
    model_id: model,
    ...(values['embedding'] ? { options: { isEmbedding: true } } : {}),
  }
  const stop = new AbortController()
  const startedAt = Date.now()
  let sawReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => (sawReady = resolve))
  const show = (m: CoreEventMessage) => {
    if (m.event !== 'session:load-progress') return
    const data = m.data as { provider: string; model_id: string; stage: string; elapsed_ms: number }
    if (data.provider !== provider || data.model_id !== model) return
    if (data.stage === 'ready') sawReady()
    if (ctx.flags.json) ctx.io.stdout(`${JSON.stringify({ load: data })}\n`)
    else if (!ctx.flags.quiet) ctx.io.stderr(`${loadStageText(data)}\n`)
  }
  // Subscribed before the load is asked for: the stream replays from its snapshot's cursor, so a fast
  // load's stages are not lost; a stream that cannot connect does not hold the load up.
  let connected: () => void = () => {}
  const subscribed = new Promise<void>((resolve) => (connected = resolve))
  void link.events
    .subscribe(show, { signal: stop.signal, onSnapshot: () => connected() })
    .catch(() => {})
    .finally(() => connected())
  await Promise.race([subscribed, new Promise((r) => setTimeout(r, SUBSCRIBE_WAIT_MS))])
  let interrupted = false
  const off =
    ctx.io.onInterrupt?.(() => {
      interrupted = true
      void service.execute('models.cancel', { provider, model_id: model }).catch(() => {})
    }) ?? (() => {})
  try {
    const result = await service.execute('models.load', input)
    if (interrupted) return 130
    // The last stage may still be on its way; a native load has none to wait for.
    await Promise.race([ready, new Promise((r) => setTimeout(r, LAST_STAGE_WAIT_MS))])
    const envelope = { schema_version: 1, operation: 'models.load', status: 'ok', result: result ?? null }
    if (ctx.flags.json) ctx.io.stdout(`${JSON.stringify(envelope)}\n`)
    else ctx.out.line(`${model} is running on ${provider} (${Math.round((Date.now() - startedAt) / 1000)}s).`)
    return 0
  } catch (error) {
    if (interrupted) {
      ctx.io.stderr(`The load of ${model} was cancelled.\n`)
      return 130
    }
    const tail = await service
      .execute('models.logs', { provider, model_id: model })
      .then((log) => (typeof log === 'string' ? log.trimEnd().split('\n').slice(-20) : []))
      .catch(() => [] as string[])
    if (tail.length)
      ctx.io.stderr(`Last lines of ${provider}'s log for ${model}:\n${tail.map((l) => `  ${l}\n`).join('')}`)
    throw error
  } finally {
    stop.abort()
    off()
  }
}

/** `atc models logs <model> --engine <provider>`: the loaded model's log, or its last failed load's. */
export async function modelLogs(ctx: CommandContext, model: string, provider: string): Promise<number> {
  const { service } = await attachWorkspace(ctx)
  const log = await service.execute('models.logs', { provider, model_id: model })
  const text = typeof log === 'string' ? log : ''
  ctx.out.result({ provider, model_id: model, log: text }, () =>
    text
      ? ctx.io.stdout(text.endsWith('\n') ? text : `${text}\n`)
      : ctx.out.note(`no log for ${model} on ${provider}`)
  )
  return 0
}
