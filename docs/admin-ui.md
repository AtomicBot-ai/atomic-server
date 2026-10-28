# The web admin

`packages/admin-ui` is the SPA the `atc` daemon serves on `http://127.0.0.1:1338`. It exists for the person
who would rather click than type: the same daemon, the same data, a browser instead of a terminal. This
page covers the stack, where the code comes from, how it talks to the daemon, and how to work on it.

## Stack

React 19, Vite 6, Zustand 5, Tailwind 4,
shadcn-style components (`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`,
`lucide-react`). Tests: vitest with jsdom and Testing Library. Scripts in `packages/admin-ui/package.json`:
`dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `lint` (its own browser/React eslint
config; the root config ignores the package), `test`. It is an npm workspace of the root package; the root
`typecheck`, `lint` and `test:ui` scripts reach into it.

## Why copy-and-adapt from `Atomic-Chat/web-app`

The desktop app's `web-app/` already has the pages a server admin needs — API server, models and
downloads, backends, hardware, proxy settings — written against a `ServiceHub` whose Tauri implementations
call `invoke`. Its stack is the one above. Rather than write a second UI or extract a shared package (the
app and `atc` are separate products with separate release trains; ADR 2026-09-24
"Copy and adapt the desktop web app for the admin UI"), the admin **mirrors `web-app/src`'s structure**
(`routes/ containers/ components/ui/ hooks/ services/ stores/ lib/`) so that files lift 1:1, and replaces
exactly one seam: `invoke`.

What lifts as is: `stores/`, `components/ui/*`, the hooks and containers for the API server, downloads,
hardware and proxy config, `lib/hardware-tier.ts`, the model-search service and catalog registries (with
`fetch` swapped). What is rewritten thinly against the BFF routes: the Tauri `services/*/tauri.ts`
implementations, the models default service, the backend updater, `lib/utils.ts` (it pulls the extension
manager in the app), and `lib/platform.ts`, which reports a platform `'admin'` with every server feature
on. `ServiceHub` interface names are kept; `AdminServiceHub` implements the subset the admin needs.

## Provenance: the header and `LIFTED.md`

Every file taken from the app starts with

```ts
// Lifted from Atomic-Chat/web-app/src/<path> @ <commit>; adapted: <what changed, one line>
```

and has a line in `packages/admin-ui/LIFTED.md` (path here, path there, commit, adaptation). The point
is not attribution but repair: when the app fixes a bug in a lifted file, the header says which commit the
copy came from, so the fix can be pulled by diffing against it. A file without the header was written for
`atc`. There is no shared package with the app; the copies live here on their own.

## The bridge

`services/core-bridge.ts` exports `createHttpInvoke()`, which has the same shape as Tauri's `invoke` and
answers the three commands the app's core runtime uses:

| `invoke(command, args)` | In the app | Here |
| --- | --- | --- |
| `atomic_core_call { method, path, body }` | Rust proxies to the core's `/atomic/v1` with the token | `fetch('/api/core' + path, { method, body })` with `X-Atc-Admin: 1` and the session cookie; the daemon checks the allowlist and adds the control token |
| `atomic_core_snapshot` | Rust | `GET /api/core/snapshot` |
| `atomic_core_status` | Rust | `GET /api/status` |

`services/atomic-core-runtime.ts` is a verbatim copy of the app's
`extensions/shared/atomicCoreRuntime.ts` — `createCoreRuntime(provider, invoke)` builds every request the
UI makes, parameterised by the `invoke` function and importing nothing. Wire types come from
`src/contract` (the browser-safe folder of the root package: `AdminStatus`, `AdminConfigView`,
`ADMIN_API`, `ADMIN_HEADER`, `SESSION_COOKIE`) and from `@atomic-chat/core/contracts`. The
control token never reaches the page; the page never knows the core's port.

Login: the SPA reads `#token=…` from the URL once, posts it to `POST /api/session`, drops the fragment
from the address bar and relies on the `HttpOnly` cookie from then on. A 401 anywhere means "open the URL
`atc admin` prints".

## Events (SSE)

`services/events.ts` opens `EventSource('/api/events')` — one stream carrying the core's events and
`atc:*` events (`atc:status`, `atc:log`, `atc:host-step`, `atc:download`), each with a relay id `r<n>`.
The browser's `EventSource` sends `Last-Event-ID` on reconnect; the daemon replays from its ring or sends
`resync`, on which the page re-fetches the snapshot. `useCoreEvents(name, handler)` is the hook, the
counterpart of the app's `atomic-core://<event>` listeners, so lifted hooks keep their shape. A change of
`instance_id` in the snapshot means a new core owns the folder: derived state is reset.

## Dev mode

```bash
atc admin --no-open                 # a daemon with the admin on 127.0.0.1:1338; note the token
cd packages/admin-ui && npm run dev # Vite on its own port, with server.proxy['/api'] → http://127.0.0.1:1338
```

Open the Vite URL with `#token=<token>` (from `atc admin token`) once; the cookie is set by the proxied
`/api/session` and the SSE stream is proxied too. A daemon started from source is
`node dist/bin.js admin --no-open` after `npm run build`.

## Build and embed

```bash
npm run build:ui        # packages/admin-ui/dist
npm run embed:ui        # scripts/embed-admin-assets.mjs → src/admin/static-assets.generated.ts
npm run build:bin       # runs embed:ui, then compiles the binary
```

The generated module holds every file of `dist/` gzipped and base64-encoded, keyed by path, plus
`ADMIN_BUILD_ID` (a sha256 prefix of the contents; `atc version` and the `x-atc-admin-build` response
header report it). Without a built SPA the script embeds `resources/admin-placeholder.html` with the
build id `placeholder`: a page that signs in with the token and shows `/api/status` as JSON, so `npm test`
and `build:bin` never need Vite. The generated file is gitignored. See ADR 2026-09-24 "Embed the admin
UI as a generated module".

Serving (`src/admin/static.ts`): hashed asset names get `cache-control: immutable`, everything else
`no-cache`; any path that is not a file gets `index.html`; CSP
`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`.

## The workspace

`main.tsx` renders `containers/AdminRoot.tsx`: it trades the `#token=` fragment for a session, shows
`SignIn` on a 401 and otherwise the workspace in `src/workspace/` — the same Playground, Server and
Engines & Models sections as the terminal UI, in the order `src/contract` sets
(ADR 2026-10-13 "Shared server workspaces and agent controls"). There is no URL router: navigation is
workspace state, as in the terminal (ADR 2026-10-15 "Retire the pre-workspace screens"). Every action is a
workspace operation from the shared registry, called through `workspace/workspace-api.ts`.

### Engines, models and loads

The admin shows managed engines and Foundry Local with the words of the commands: `@view` is an alias
for `src/workspace-view/` (browser-safe, shared with the terminal UI and the commands), and live state
comes from the workspace snapshot the SPA polls (`engines`, `host_steps`, `loads`).

- **Engines tab** (`library/EnginesTab.tsx`) lists what `engines.list` registers, in the order of
  `orderEngines`. A managed engine opens `EngineSetup.tsx`: its state, the whole plan with Agree bound to
  the digest shown (asked again when the plan changed), phases and image bytes, the privileged step's
  command to copy, sign-in or restart, continue and cancel, update, and removal with "keep models"; the
  core's state is read again whenever the live operation moves on (`workspace-view/engine-live.ts`).
  Foundry Local opens `FoundryLocal.tsx`: the library's accelerators, Prepare per accelerator with each
  step's progress, Install that prepares after it. Engine settings pick a managed engine's `gpu_id`
  among the environment's cards.
- **Catalog and model install** filter chat models by format. GGUF opens `ModelInstall.tsx` as before;
  a managed engine's checkpoint opens `ManagedModelInstall.tsx` (every engine's verdict; Download only
  through an installed engine that takes it, otherwise "Install <engine>"); a Foundry Local model opens
  `FoundryModelInstall.tsx` (variants with verdicts, unverified catalog models, Prepare or Install when
  the verdict asks for it). Installed models list each model's own providers to load with, and removal
  warns that a store model goes for every managed engine. Downloads resume and cancel each job with its
  owner's operations.
- **Setup wizard** offers every registered chat engine; a managed engine or Foundry Local not installed
  yet is installed inside the wizard, then its own models are listed and the download is verified with
  that engine.
- **Update notice.** `UpdateToast.tsx`, bottom right on every page (top right in the chat, whose composer
  owns the bottom), says a newer atc is out (the
  snapshot's `atc`, from the server's own daily look at releases): the versions, the command that installs
  it with Copy, the release page; Dismiss keeps it away for that release (`localStorage`).
- **Banner and loads.** `HostStepBanner.tsx` shows the privileged step the server waits on, with its
  command, in the Cockpit and on the Server page. A managed engine's load shows its stage and time on
  the installed model's row and in the Cockpit, with Cancel loading, and after a failure the error and
  the last attempt's log; the chat picker loads an installed model with the provider chosen.
