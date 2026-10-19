// Mirrors Atomic-Chat/web-app/eslint.config.js @ f71e2280b: flat config, browser globals, react-hooks,
// react-refresh. Adapted: tests are linted too, files stop at 300 lines (AGENTS.md rule 7) except the verbatim core
// runtime, and the shadcn primitives may export their `cva` variants next to the component (as the app's do).
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'max-lines': ['error', { max: 300 }],
    },
  },
  {
    // Lifted verbatim (LIFTED.md); splitting it would break diffing against the app.
    files: ['src/services/atomic-core-runtime.ts'],
    rules: { 'max-lines': 'off' },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  }
)
