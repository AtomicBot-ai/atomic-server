// The Gemma 4 and Qwen templates are the fixtures of Atomic-Chat/src-tauri/src/core/foundry_template.rs @ e47154e9b.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { repairChatTemplate, repairTemplateFile } from './foundry-template.js'

const GEMMA4 = `{%- macro format_function_declaration(tool_data) -%}
    declaration:{{- tool_data['function']['name'] -}}{description:<|"|>{{- tool_data['function']['description'] -}}<|"|>
    {%- set params = tool_data['function']['parameters'] -%}
    {%- if 'response' in tool_data['function'] -%}
{%- endmacro -%}
                    {%- set function = tool_call['function'] -%}
                        {{- raise_exception("chat_template: tool_calls[].function.arguments must be a JSON object (mapping), not a string. Deserialize arguments before passing to the template.") -}}
                                {%- set ns_tname.name = tc['function']['name'] -%}
`
const QWEN = '{%- for tool in tools %}\n{{- tool | tojson }}\n{%- endfor %}'
const scratch = mkdtempSync(join(tmpdir(), 'atc-ftpl-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('repairChatTemplate', () => {
  it('lets every function index take an unwrapped tool too', () => {
    const repaired = repairChatTemplate(GEMMA4)!
    const fallback =
      /\(([A-Za-z_][A-Za-z0-9_]*)\['function'\] if ([A-Za-z_][A-Za-z0-9_]*)\['function'\] else ([A-Za-z_][A-Za-z0-9_]*)\)/g
    expect(repaired.replace(fallback, '')).not.toContain("['function']")
    expect(repaired).toContain(
      "declaration:{{- (tool_data['function'] if tool_data['function'] else tool_data)['name'] -}}"
    )
    expect(repaired).toContain(
      "{%- set function = (tool_call['function'] if tool_call['function'] else tool_call) -%}"
    )
    expect(repaired).toContain(
      "{%- set ns_tname.name = (tc['function'] if tc['function'] else tc)['name'] -%}"
    )
    expect(repaired).toContain("{{- function['arguments'] | trim -}}")
    expect(repaired).not.toContain('raise_exception')
  })

  it('runs once and leaves other templates alone', () => {
    expect(repairChatTemplate(repairChatTemplate(GEMMA4)!)).toBeUndefined()
    expect(repairChatTemplate(QWEN)).toBeUndefined()
  })
})

describe('repairTemplateFile', () => {
  it("rewrites a model folder's template in place, once, leaving no temporary file", async () => {
    const dir = join(scratch, 'gemma-4-e2b-it-cuda-gpu')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'chat_template.jinja'), GEMMA4)
    expect(await repairTemplateFile(dir)).toBe(true)
    expect(readFileSync(join(dir, 'chat_template.jinja'), 'utf8')).toContain(
      "if tool_data['function'] else tool_data"
    )
    expect(await repairTemplateFile(dir)).toBe(false)
    expect(await repairTemplateFile(join(scratch, 'not-downloaded'))).toBe(false)
    expect(readdirSync(dir)).toEqual(['chat_template.jinja'])
  })
})
