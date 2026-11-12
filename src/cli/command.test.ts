import { describe, expect, it } from 'vitest'
import { defineCommand, parseInvocation, resolveCommand, walkCommands } from './command.js'
import { AtcError } from '../errors/index.js'

const root = defineCommand({
  name: 'atc',
  summary: 'root',
  subcommands: [
    defineCommand({
      name: 'models',
      summary: 'models',
      subcommands: [
        defineCommand({
          name: 'pull',
          summary: 'pull',
          options: {
            'quant': { type: 'string', description: 'q' },
            'force': { type: 'boolean', short: 'f', description: 'f' },
            'no-verify': { type: 'boolean', description: 'n' },
          },
          positionals: [{ name: 'id', description: 'id', required: true }],
          run: async () => 0,
        }),
        defineCommand({ name: 'list', summary: 'list', run: async () => 0 }),
      ],
    }),
    defineCommand({
      name: 'admin',
      summary: 'admin',
      defaultSubcommand: 'open',
      subcommands: [
        defineCommand({
          name: 'open',
          summary: 'open',
          options: { port: { type: 'string', description: 'p' } },
          run: async () => 0,
        }),
        defineCommand({ name: 'token', summary: 'token', run: async () => 0 }),
      ],
    }),
  ],
})

describe('resolveCommand', () => {
  it('walks the tree and leaves the rest for the command', () => {
    const r = resolveCommand(root, ['models', 'pull', 'x', '--quant', 'Q4'])
    expect(r.path).toEqual(['models', 'pull'])
    expect(r.args).toEqual(['x', '--quant', 'Q4'])
  })

  it('applies the default subcommand when none is named, also before flags', () => {
    expect(resolveCommand(root, ['admin']).path).toEqual(['admin', 'open'])
    expect(resolveCommand(root, ['admin', '--port', '1']).path).toEqual(['admin', 'open'])
    expect(resolveCommand(root, ['admin', 'token']).path).toEqual(['admin', 'token'])
  })

  it('stops at an unknown word so the parser can report it', () => {
    const r = resolveCommand(root, ['models', 'bogus'])
    expect(r.path).toEqual(['models'])
    expect(() => parseInvocation(r)).toThrow(/Unexpected argument: bogus/)
  })
})

describe('parseInvocation', () => {
  it('parses options and positionals strictly', () => {
    const inv = parseInvocation(resolveCommand(root, ['models', 'pull', 'x', '--quant', 'Q4', '-f']))
    expect(inv.values).toEqual({ quant: 'Q4', force: true })
    expect(inv.positionals).toEqual(['x'])
  })

  it('keeps an option named no-<x> under its own name, and --no-<x> still negates a boolean', () => {
    expect(parseInvocation(resolveCommand(root, ['models', 'pull', 'x', '--no-verify'])).values).toEqual({
      'no-verify': true,
    })
    expect(parseInvocation(resolveCommand(root, ['models', 'pull', 'x', '--no-force'])).values).toEqual({
      force: false,
    })
  })

  it('rejects the undeclared positive spelling of an explicitly named no-<x> option', () => {
    expect(() =>
      parseInvocation(resolveCommand(root, ['models', 'pull', 'x', '--verify', '--no-verify']))
    ).toThrow(/Unknown option '--verify'/)
    expect(
      parseInvocation(resolveCommand(root, ['models', 'pull', '--', '--no-verify'])).positionals
    ).toEqual(['--no-verify'])
  })

  it('reports usage errors with the help hint', () => {
    expect(() => parseInvocation(resolveCommand(root, ['models', 'pull']))).toThrow(AtcError)
    try {
      parseInvocation(resolveCommand(root, ['models', 'pull', 'x', '--nope']))
    } catch (e) {
      expect((e as AtcError).code).toBe('ATC_USAGE')
      expect((e as AtcError).hint).toContain('atc models pull --help')
    }
    expect(() => parseInvocation(resolveCommand(root, ['models', 'list', 'extra']))).toThrow(
      /Unexpected argument/
    )
  })
})

describe('walkCommands', () => {
  it('lists every command with its path in order', () => {
    expect(walkCommands(root).map((c) => c.path.join(' '))).toEqual([
      'models',
      'models pull',
      'models list',
      'admin',
      'admin open',
      'admin token',
    ])
  })
})
