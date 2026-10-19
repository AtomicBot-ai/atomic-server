# atc admin UI

The web admin the `atc` daemon serves at `http://127.0.0.1:1338/`. A React 19 SPA on Vite, Zustand, Tailwind 4 and
shadcn-style `components/ui`. Files taken from `Atomic-Chat/web-app/src` keep their provenance (see
`LIFTED.md`); the workspace in `src/workspace/` is written for atc and mirrors the terminal UI.

The daemon's BFF is under `/api/*`; its wire types and route constants come from `src/contract` in the
repo root through the `@contract` alias. That folder is the only thing the SPA imports from the CLI.

## Signing in

`atc admin` prints `http://127.0.0.1:1338/#token=<token>`. On load the SPA posts the fragment token to
`POST /api/session`, which sets an HttpOnly cookie, and removes the fragment from the URL. Without a session
(`401` on `/api/status`) it shows a sign-in screen that also accepts a pasted token.

## Development

```sh
npm run dev          # Vite on http://127.0.0.1:1339, /api proxied to the daemon on 127.0.0.1:1338
npm run typecheck    # tsc -b
npm run lint         # eslint .
npm test             # vitest run (jsdom)
```

Start the daemon first (`atc start`, then `atc admin` for a token). The dev server proxies `/api/*` to
`http://127.0.0.1:1338` with `changeOrigin`, and the SSE stream on `/api/events` works through the proxy.
Open the dev URL with the token fragment from `atc admin` (`http://127.0.0.1:1339/#token=...`), or paste the
token into the sign-in screen.

## Production

```sh
npm run build        # tsc -b && vite build → dist/
```

From the repo root, `npm run embed:ui` turns `dist/` into `src/admin/static-assets.generated.ts`, which the
daemon serves (and `npm run build:bin` embeds into the binary). `npm run build:ui` at the root runs this
package's build.

## Layout

- `src/routes/` — one file per page (`__root.tsx` is the shell: sidebar, header, sign-in gate).
- `src/services/` — the `ServiceHub`: `core` (the app's `atomicCoreRuntime` over `/api/core`), `events`
  (SSE), `status`, `config`, `session`.
- `src/stores/status-store.ts` — `GET /api/status`, refetched on the relay's session/server events and `resync`.
- `src/containers/` — page-level composites (`AdminShell`, `SignIn`, `setup/ManagedEnvWizard`).
- `src/components/ui/` — shadcn primitives lifted from the app.

Formatting follows the repo root's prettier config (`.prettierrc` here repeats it and exempts the verbatim
`atomic-core-runtime.ts`).
