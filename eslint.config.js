import { readdirSync } from 'node:fs'
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
// `../<module>/<file>` reaches past a sibling module's index.ts. Modules are the folders of `src/`;
// folders inside a module (`src/tui/workspace/chat/`) are its own business.
const MODULES = readdirSync(new URL('./src', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
const THROUGH_INDEX = {
  regex: `^(\\.\\./)+(${MODULES.join('|')})/(?!index(\\.js)?$)`,
  message: 'Import sibling modules through their index.ts only.',
}

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      '.core',
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
      'no-restricted-imports': ['error', { paths: NODE_PREFIX_PATHS, patterns: [NO_BUN] }],
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
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', { paths: NODE_PREFIX_PATHS, patterns: [NO_BUN, THROUGH_INDEX] }],
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
          patterns: [{ group: ['node:*'], message: 'src/contract must stay browser-safe.' }, THROUGH_INDEX],
        },
      ],
    },
  }
)
