import { readFileSync } from 'node:fs'
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Node builtins that must always be imported with the `node:` prefix.
const NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'net',
  'os',
  'path',
  'readline',
  'readline/promises',
  'stream',
  'stream/promises',
  'string_decoder',
  'timers',
  'timers/promises',
  'url',
  'util',
  'zlib',
]

const NODE_PREFIX_PATHS = NODE_BUILTINS.map((name) => ({
  name,
  message: `Import '${name}' as 'node:${name}'.`,
}))
const NO_BUN = { group: ['bun', 'bun:*'], message: 'atc code must stay Node-compatible.' }
// The core only through its package `exports` (AGENTS.md §8), read from the installed core so a new
// subpath is allowed the day it is pinned. A deep path (`/dist/…`, `/src/…`) reaches past its contract.
const CORE_SUBPATHS = Object.keys(
  JSON.parse(readFileSync(new URL('./node_modules/@atomic-chat/core/package.json', import.meta.url), 'utf8'))
    .exports
)
  .filter((subpath) => subpath !== '.')
  .map((subpath) => subpath.slice(2))
const CORE_EXPORTS_ONLY = {
  regex: `^@atomic-chat/core/(?!(${CORE_SUBPATHS.join('|')})$)`,
  message: `Import the core through its exports only (${CORE_SUBPATHS.join(', ')}); a missing one is a core change (AGENTS.md §8).`,
}

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      '.core',
      // Agent worktrees (`.claude/worktrees/*`) are other checkouts, with their own `dist/`.
      '.claude',
      // The admin SPA lints with its own browser/React config (`packages/admin-ui/eslint.config.js`).
      'packages/admin-ui',
      '**/*.generated.ts',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      // Runtime-agnostic (same rule as the core): the same code runs under Node in tests and inside
      // the Bun binary. No Bun globals, no bun: modules, no bare builtins.
      'no-restricted-globals': [
        'error',
        { name: 'Bun', message: 'atc code must stay Node-compatible. Use node:* APIs.' },
      ],
      'no-restricted-imports': ['error', { paths: NODE_PREFIX_PATHS, patterns: [NO_BUN, CORE_EXPORTS_ONLY] }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='versions'] > Identifier[name='bun']",
          message: 'Do not branch on the runtime.',
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // AGENTS.md rule 7: split a file before it crosses 300 lines.
      'max-lines': ['error', { max: 300 }],
    },
  },
  {
    // The terminal UI is React (Ink): the hooks rules apply as in the admin SPA.
    files: ['src/tui/**/*.tsx', 'src/tui/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The admin wire contract is shared with the browser: no node:* at all.
    files: ['src/contract/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'src/contract must stay browser-safe.' },
            CORE_EXPORTS_ONLY,
          ],
        },
      ],
    },
  }
)
