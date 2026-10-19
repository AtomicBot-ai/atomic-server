# Lifted files

Files copied from the desktop app (`Atomic-Chat`, commit `f71e2280b`) so they can be lifted again 1:1 later.
Every source file carries a header comment `// Lifted from Atomic-Chat/<path> @ f71e2280b; adapted: <what changed>`;
the JSON configs and `eslint.config.js` are listed here only. They are Apache-2.0, Copyright Atomic Chat and
Menlo Research, as the rest of this repository; the attribution is in the root `NOTICE`.

| Here                                  | From                                          | Adapted                                                                  |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/utils.ts`                    | `web-app/src/lib/utils.ts`                    | `cn()` only; the rest is chat, model and markdown code                   |
| `src/components/ui/button.tsx`        | `web-app/src/components/ui/button.tsx`        | none (formatted with this repo's prettier)                               |
| `src/components/ui/card.tsx`          | `web-app/src/components/ui/card.tsx`          | none (formatted with this repo's prettier)                               |
| `src/components/ui/input.tsx`         | `web-app/src/components/ui/input.tsx`         | none (formatted with this repo's prettier)                               |
| `src/index.css`                       | `web-app/src/index.css`                       | theme tokens and the base layer only; no fonts, markdown, katex, animations |
| `src/hooks/useServiceHub.ts`          | `web-app/src/hooks/useServiceHub.ts`          | `ServiceHub` is a type-only import                                       |
| `src/services/atomic-core-runtime.ts` | `extensions/shared/atomicCoreRuntime.ts`      | none, verbatim (prettier skips it: `requirePragma` override in `.prettierrc`) |
| `src/main.tsx`                        | `web-app/src/main.tsx`                        | renders the admin root, no router; no Sentry, migrations, mobile or zoom handling |
| `tsconfig.app.json`, `tsconfig.node.json` | `web-app/tsconfig.*.json`                 | `lib` ES2023 / target ES2022 (the contract's type imports reach Node code); `@contract` path |
| `eslint.config.js`                    | `web-app/eslint.config.js`                    | tests linted, `components/ui` may export variants                        |

Mirrored in shape, not copied: `src/services/index.ts` (the `ServiceHub` name and the getter shape),
`src/stores/*` (zustand `create`).

Written for the admin (no counterpart in the app): `src/containers/*`, `src/workspace/*`,
`src/services/{admin-api,core-bridge,events,session}.ts`, `src/stores/status-store.ts`,
`src/hooks/{useAdminStatus,useTheme}.ts`.
