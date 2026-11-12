import { describe, expect, it } from 'vitest'
import { defineCommand } from './command.js'
import { renderHelp, usageLine } from './help.js'

const pull = defineCommand({
  name: 'pull',
  summary: 'Download a model',
  description: 'Download a model from Hugging Face or the catalog.',
  options: {
    quant: { type: 'string', description: 'Quantisation to pick', placeholder: 'Q4_K_M' },
    force: { type: 'boolean', short: 'f', description: 'Re-download', default: false },
  },
  positionals: [{ name: 'id', description: 'Model id or owner/repo', required: true }],
  examples: ['atc models pull Qwen/Qwen3-8B-GGUF'],
  run: async () => 0,
})

const root = defineCommand({
  name: 'atc',
  summary: 'Atomic Chat server CLI',
  subcommands: [
    defineCommand({ name: 'serve', summary: 'Serve a model', group: 'server', run: async () => 0 }),
    defineCommand({ name: 'models', summary: 'Manage models', group: 'models', subcommands: [pull] }),
    defineCommand({ name: 'daemon', summary: 'hidden', hidden: true, run: async () => 0 }),
  ],
})

describe('help', () => {
  it('renders the usage line from the spec', () => {
    expect(usageLine(pull, ['models', 'pull'])).toBe('atc models pull <id> [options]')
    expect(usageLine(root.subcommands![1]!, ['models'])).toBe('atc models <command>')
  })

  it('renders a command with arguments, options, examples and the global options', () => {
    const text = renderHelp(pull, ['models', 'pull'])
    expect(text).toContain('Usage: atc models pull <id> [options]')
    expect(text).toContain('Download a model from Hugging Face or the catalog.')
    expect(text).toContain('<id>')
    expect(text).toContain('--quant <Q4_K_M>')
    expect(text).toContain('-f, --force')
    expect(text).toContain('(default: false)')
    expect(text).toContain('atc models pull Qwen/Qwen3-8B-GGUF')
    expect(text).toContain('--data-folder <path>')
  })

  it('groups the root help and hides hidden commands', () => {
    const text = renderHelp(root, [])
    expect(text).toContain('Server:')
    expect(text).toContain('Models & engines:')
    expect(text).not.toContain('daemon')
  })
})
