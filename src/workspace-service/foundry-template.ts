// Ported from Atomic-Chat/src-tauri/src/core/foundry_template.rs @ e47154e9b; adapted: TypeScript, run once after the download rather than before every load (design D9: `atc` alone writes these folders).
/**
 * Foundry Local renders a model's own `chat_template.jinja` but hands it tools and tool calls already
 * unwrapped (`{name, description, parameters}`, not OpenAI's `{type, function: {…}}`). A template that
 * reads `tool['function']['name']` — Gemma 4's — fails on every request with tools. The template is
 * rewritten to take either shape: every `x['function']` becomes `(x['function'] if x['function'] else
 * x)`, and Gemma's refusal of string arguments prints them as they are. A template that never indexes
 * `['function']` (Qwen's) is left alone; the rewrite is marked so it runs once.
 */

import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const TEMPLATE_FILE = 'chat_template.jinja'
const MARK =
  "{#- atomic-chat: Foundry Local hands tools and tool calls over without their 'function' wrapper -#}\n"
const FUNCTION_INDEX = /\b([A-Za-z_][A-Za-z0-9_]*)\['function'\]/g
const STRING_ARGUMENTS_REFUSAL =
  /\{\{-?\s*raise_exception\("chat_template: tool_calls\[\]\.function\.arguments must be a JSON object[^"]*"\)\s*-?\}\}/g

/** The template rewritten to take unwrapped tools, or `undefined` when it needs no change. */
export function repairChatTemplate(template: string): string | undefined {
  if (template.startsWith(MARK) || !new RegExp(FUNCTION_INDEX.source).test(template)) return undefined
  const unwrapped = template.replace(FUNCTION_INDEX, "($1['function'] if $1['function'] else $1)")
  return `${MARK}${unwrapped.replace(STRING_ARGUMENTS_REFUSAL, "{{- function['arguments'] | trim -}}")}`
}

/** Rewrite one model folder's template in place; `false` when there is none or it needs nothing. */
export async function repairTemplateFile(dir: string): Promise<boolean> {
  const path = join(dir, TEMPLATE_FILE)
  const template = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  const repaired = template === undefined ? undefined : repairChatTemplate(template)
  if (repaired === undefined) return false
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, repaired)
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
  return true
}
