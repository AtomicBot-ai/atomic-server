# AGENTS.md — Atomic Server (`atc`, repository `eye-cli`)

Operating instructions for AI agents and humans working in this repository. Everything here applies to
every task. Anything that applies only sometimes lives behind a link.

| Need                                             | Go to                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| The product's words and what each command is for | [`docs/concepts.md`](docs/concepts.md)                   |
| Processes, ports, tokens, data folder, host steps | [`docs/architecture.md`](docs/architecture.md)           |
| Why something is built this way                  | [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md)     |
| What comes next, iteration by iteration           | [`docs/roadmap.md`](docs/roadmap.md)                     |
| Every command and its help text (generated)      | [`docs/commands.md`](docs/commands.md)                   |
| Test layers, helpers, the CI matrix              | [`docs/testing.md`](docs/testing.md)                     |
| Releasing, installers, the core pin              | [`docs/release.md`](docs/release.md)                     |
| The web admin SPA                                | [`docs/admin-ui.md`](docs/admin-ui.md)                   |

---

## 1. What this is

**Atomic Server**: one binary, `atc`, that embeds `atomic-chat-core` (engines, models, the OpenAI-compatible
`/v1` API) and adds what a server needs — a background server process that owns the data folder, a web
admin on loopback, a terminal UI, and the privileged host steps of managed runtimes. No engine ships inside:
engines are installed on demand and the core picks the build for the hardware. Atomic Server is a separate
product from the Atomic Chat desktop app; they share the core and nothing else. Words in user-facing text
follow [`docs/concepts.md`](docs/concepts.md) ("server", not "daemon"; `run`/`unload` a model).

Real today: the server and its lifecycle (including replacing one another build left running), OS services,
its own rotated log, the API with its keyring, the terminal UI, the admin's dashboard, config, doctor,
`atc update`, the installers, the signed release pipeline and the Linux packages (deb and rpm from our
apt/dnf repository on Hetzner Object Storage, the AUR's `atc-bin`). The remaining stubs exit 3;
`src/cli/not-implemented.ts` is the map of what is stubbed and when it lands. Bare `atc` on an interactive terminal opens the terminal UI
(Ink, `src/tui/`); anywhere else it prints help and exits 2 — scripts never get a screen.

---

## 2. Repository map

Entry points and everything outside `src/`:

| Path | What lives there |
| --- | --- |
| `src/bin.ts` | The only file with side effects on import: real I/O, the daemon spawner, `process.exit`. |
| `src/main.ts`, `src/io.ts` | `runCli(argv, io, deps)`; `AtcIo` (real or recording) — nothing else touches `process.stdout`. |
| `packages/admin-ui/` | The web admin SPA (React, Vite, Tailwind): the same workspace as the terminal UI, in a browser. |
| `test/` | `contract/` (fake core and real core), `e2e/` (the built program), `runtime-compat/`, `installers/`, `scripts/`, `helpers/`. |
| `scripts/` | Binary build, SPA embedding, release, installers, Linux packages and their repository, gates, generated docs. |
| `packaging/` | The deb/rpm definition (nfpm), the AUR PKGBUILD template, the packages' public signing key. |
| `docs/` | Architecture, testing, release, admin UI, generated `commands.md`, `decisions/` (ADRs). |

Every module under `src/`, from the comment that opens its `index.ts` (`npm run docs:modules`; lint fails
when this table is stale or a module's `index.ts` has no comment):

<!-- module-map:start -->
| Module | What it is |
| --- | --- |
| `src/admin/` | The web admin: BFF routes, sessions, gates, the event relay, the embedded SPA and the listener. |
| `src/agent-control/` | Agents driving the workspace operations: the `atc mcp` stdio session and `atc control` input. |
| `src/agent-launch/` | Connecting coding agents: the supported agents, their profiles in the data folder, launching. |
| `src/cli/` | The command framework: specs, resolution and parsing, help, completion, the error/exit-code convention and the context every command runs against. |
| `src/commands/` | The command tree. Order here is the order in `atc --help`. |
| `src/config/` | Paths, the config field table, parsing, migrations, files and the resolved (layered) config. |
| `src/contract/` | The browser-safe wire contract every client shares: the admin BFF's routes and types, the workspace operation registry, navigation and setup goals. The daemon, CLI, MCP, terminal UI and web admin import it; it imports only types from the rest of atc. No `node:*` here. |
| `src/core-link/` | Finding, starting and talking to the core: the daemon record, attach-or-spawn, `CoreLink`, events. |
| `src/daemon/` | The daemon process: spawning it detached, and running it (core + admin + host agent). |
| `src/doctor/` | `atc doctor`: the check table and its runner. |
| `src/downloads/` | Model downloads: resumable, verified, parallel byte ranges written in place, proxies and progress. |
| `src/engines/` | Engines: backend packs (core-installed) and the managed container runtime state machine. |
| `src/errors/` | `AtcError`, its codes, exit codes and the one rendering of any failure. Depends on nothing. |
| `src/host/` | Host services: running programs, facts about the machine and session, elevation and the host-step protocol, hardware probing, OS services, ports. `nodeHostServices` is the real one; tests build the same shape from fakes. |
| `src/models/` | Model sources, spec parsing and the installer seam. |
| `src/output/` | Everything a command prints: colours, tables, the printer, progress, prompts and the logger. |
| `src/telemetry/` | Error reports: what the core is told, and the one-time notice. |
| `src/terminal-data/` | Client documents in the data folder: the cross-process store, API keys and chat history. |
| `src/terminal-service/` | Public OpenAI-compatible calls for the terminal UI and `atc chat`: models, streamed chat, images. |
| `src/terminal-setup/` | Guided model setup: engine choice, the curated catalog, durable setup records and bounded UI waits. |
| `src/tui/` | The terminal UI (`atc tui`, and bare `atc` on a terminal): an Ink app over the daemon. Loaded lazily by the command, so plain commands never pay for React and Ink. |
| `src/update/` | Self-update: the release lookup, checksums, signatures, the replace plan and applying it. |
| `src/workspace-service/` | The daemon-owned workspace: operation dispatch to the core, snapshots, jobs and its client. |
| `src/workspace-view/` | Browser-safe view selectors shared with the terminal. |
<!-- module-map:end -->

---

## 3. Code rules

1. **One module = one folder with `index.ts` as the only public entry**, opened by a one-line doc comment
   (it becomes the module's row in §2). A sibling module is imported only through its `index.ts`; eslint
   fails `../<module>/<file>` in `src/`. Export deliberately.
2. **Policy is pure, I/O is separate.** Parsers, selectors, tables and plans take data and return data;
   `fs`, `child_process`, `net`, `fetch` live in a few named files. `env`, `fetch`, `exec`, `now`,
   `platform` are injected through options or `AtcIo`; never read `process.platform` inside policy code.
3. **Runtime-agnostic.** The same code runs under Node in tests and inside the Bun binary. Only `node:*`
   builtins (always with the prefix) and global `fetch`; no `Bun.*`, `bun:*`, native addons,
   `worker_threads` or branching on `process.versions.bun`. `scripts/check-runtime-agnostic.mjs` and eslint
   fail otherwise. The runtime choice lives in `scripts/build-binaries.mjs` alone.
4. **Errors** are `AtcError { code, message, details?, hint? }`; codes in `src/errors/errors.ts`. The
   core's `AtomicCoreError` passes through unchanged. Exit codes: `0` ok, `1` error, `2` usage, `3`
   `ATC_NOT_IMPLEMENTED`, `130` interrupted. `--json`: one document on stdout, errors as JSON on stderr.
5. **`src/contract/` is browser-safe:** types and string constants only, no `node:*`, only type
   imports from the rest of `atc`; core shapes come from `@atomic-chat/core/contracts`.
6. **Naming.** Files `kebab-case.ts`; React components `PascalCase.tsx`; classes `PascalCase`, functions
   `camelCase`. Wire fields `snake_case` as the core spells them.
7. **300 lines per file.** Split before you cross it; eslint `max-lines` enforces it.
8. **Tests next to the source** (`foo.ts` ↔ `foo.test.ts`), table-driven for policy code.
9. **Lifted admin files keep their provenance header** (`// Lifted from Atomic-Chat/web-app/src/<path> @
   <commit>; adapted: …`) and a line in `packages/admin-ui/LIFTED.md`.
10. **Every dependency needs a reason.** Runtime deps today: `atomic-chat-core`; `ink` and `react`, for
    `src/tui/` only. Adding one needs an explicit "ok" from the owner and an ADR.
11. **Do only what was asked.** No drive-by refactors; propose them. **Never commit unless asked.**
12. **Record non-trivial decisions** as a file in `docs/decisions/` (template `_TEMPLATE.md`) plus one
    line in `INDEX.md`, in the same session.
13. **Everything in the repo is English** — code, comments, commit messages, docs, scripts and their output.

---

## 4. Commands

```bash
bun install                     # @atomic-chat/core from npm, the admin-ui workspace (bun.lock is committed)
npm run lint && npm run typecheck && npm run format:check
npm test                        # unit + contract on Node
npm run build                   # dist/ (needed by e2e from source and by docs:commands)
npm run docs:commands           # regenerate docs/commands.md (CI checks it is current)
npm run docs:modules            # regenerate the module table in §2 (lint checks it is current)
npm run build:ui && npm run embed:ui && npm run build:bin   # SPA → generated module → dist/bin/atc-<triple>
npm run test:e2e && npm run test:runtime-compat && bun test test/runtime-compat
npm run verify:fast             # lint, typecheck, unit + contract tests touched by uncommitted changes
npm run verify                  # every gate, as CI runs them — run before finishing
```

Node 22 is the development and test runtime; Bun 1.3.10 installs dependencies and compiles; scripts run
through `npm run`, as in the core. Code never knows which runtime it is on.

---

## 5. How a command is built

A command is a `CommandSpec` (`src/cli/command.ts`): `name`, `summary`, `description`, `group`
(`server` | `models` | `access` | `system`), `options` (string/boolean, `parseArgs` strict), `positionals`,
`subcommands`, `defaultSubcommand`, `examples`, `hidden`, and `run(invocation, ctx)` returning the exit
code. Help, `docs/commands.md` and `atc completion` render from the spec, so nothing drifts. Global flags
are stripped once by `splitGlobalFlags` before the command parses its own.

A stub is `notImplemented(spec)`: same strict parsing and help, `run` throws `ATC_NOT_IMPLEMENTED` naming
the iteration from `PLANNED` in `src/cli/not-implemented.ts`. `not-implemented.test.ts` asserts that every
stub in the tree is registered and every registry entry is a stub. Partial stubs of working commands
(`logs --follow`, `update apply`, `config engine.*`) are in `PLANNED_PARTIAL`.

`run` gets a `CommandContext`: `io`, `flags`, `paths`, `config()` (lazy), `out` (printer: `result(json,
humanFn)`), `log`, `prompt`, `core.attach({ launch })`, `host`, `now`, `signal`. Output goes through
`ctx.out`; diagnostics through `ctx.log` (stderr). `ctx.prompt.confirm` honours `--yes` off a terminal and
otherwise fails with `ATC_CONSENT_REQUIRED`.

---

## 6. Testing

Six layers (`vitest.config.ts`, details in `docs/testing.md`):

- **unit** — `src/**/*.test.{ts,tsx}`, next to the code, pure tables and fakes; the Ink app on
  `test/helpers/fake-terminal.ts`.
- **contract** — `test/contract/`: commands against `FakeCoreLink` (`commands.test.ts`); the daemon against
  a real `AtomicCore` in a temporary folder (`daemon.test.ts`): lock, token, run record, admin auth, proxy, SSE.
- **e2e** — `test/e2e/`: the built program (`dist/bin/atc-*` when present, else `node dist/bin.js`); the
  terminal UI in a real pseudo-terminal (Python's `pty`, POSIX).
- **installers** — `test/installers/`: `install.sh` and `install.ps1` against a release on loopback, on a
  faked machine (`npm run test:installers`).
- **runtime-compat** — `test/runtime-compat/`: Node behaviours the daemon relies on, and Ink's raw keys and
  resize, under vitest **and** `bun test`.
- **ui** — `packages/admin-ui`, its own vitest (jsdom).

`test/setup.ts` points `ATC_DATA_FOLDER` and `ATOMIC_CORE_DATA_FOLDER` at a fresh `mkdtemp` per worker;
`test/helpers/tmp-data-folder.ts` gives a folder per test. No test touches a real data folder, spawns a real
engine, or reaches the network. Helpers: `testRun()` (recording I/O + fake core + fake host),
`fakeCoreLink()`, `fakeHost()`, `fakeCoreFactory()`.

New or changed exported functions get a unit test; every user-visible flow has a contract test and, once
it works in the binary, an e2e test. While iterating run `npm run verify:fast`; before finishing run
`npm run verify`, and for `src/daemon/` or `src/host/` changes also say which OS you ran e2e on.

---

## 7. Checklists

**Add a command.** Spec in `src/commands/<name>.ts` (or a group file); add it to `ROOT` in
`src/commands/index.ts` in help order; if it is a stub, `notImplemented()` + a `PLANNED` line; unit test
for any pure helper; contract test in `test/contract/commands.test.ts`; `npm run build && npm run
docs:commands`; e2e case when it works in the binary.

**Add a config field.** One line in `FIELDS` (`src/config/schema.ts`) with type, default, description
(min/max/values as needed) and the matching key in the `AtcConfig` type; a `schema.test.ts`/`parse.test.ts`
case; the env name derives from the path (`api.port` → `ATC_API_PORT`); `config list`, `config set` and
`GET /api/config` pick it up. A schema change bumps `CONFIG_VERSION` and adds a `MIGRATIONS` step.

**Add a module.** A folder under `src/` with an `index.ts` that opens with a one-line `/** … */` comment
and exports deliberately; `npm run docs:modules`; tests next to the code.

**Add a workspace operation.** One `operation(name, title, effect, description, input)` line in the
section file under `src/contract/operations/`; the description says what it does, since agents see it as
the MCP tool description; dispatch in `src/workspace-service/` (`core-operations.ts` for a core call).

**Add an admin route.** Path constant in `src/contract/routes.ts`, wire types in `contract/api.ts`
(browser-safe); handler in `src/admin/bff.ts` behind the session check; for a core passthrough, extend
`READ_ALLOW`/`WRITE_ALLOW` instead — never `/shutdown`, `/clients`, telemetry consent or cloud keys; a
`bff.test.ts` case and a `test/contract/daemon.test.ts` request; the SPA service that calls it.

---

## 8. The core

The core (`@atomic-chat/core`, repo `atomic-chat-core`) is embedded at an exact npm version, never a caret
(`docs/release.md`). What comes from where:

| Entry point                  | Used for                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `atomic-chat-core`           | `AtomicCore.create` in the daemon, `AtomicCoreError`, `CORE_VERSION`, hardware/session types.    |
| `@atomic-chat/core/host`      | Data-folder rules (`resolveCliDataFolder`, `assertCliDataFolder`, `dataLayout`), the lock read side (`inspectLock`, `waitForPublishedOwner`), `attachToOwner`, `selfCommand`, `openInBrowser`. |
| `@atomic-chat/core/client`    | `CoreClient` (control API, SSE `events`, `request`), `CoreSnapshot`, `CoreEventMessage`.          |
| `@atomic-chat/core/contracts` | Browser-safe wire types for `src/contract` and the SPA.                                          |
| `@atomic-chat/core/models`, `/downloads` | `ModelRegistry` and `Downloader` for the workspace's installs (`src/workspace-service/`). |

Rule: **never copy core logic — request an export.** Lock semantics, attach, downloads, `model.yml` and
engine selection belong to the core; a missing export is a change in the core branch (plan §9), not a copy
here. The one deliberate mirror is `src/host/managed-types.ts` (types from the core's `feat/tenzor-rt`
branch), which becomes re-exports once that branch lands. The core never probes GPUs itself; the daemon
pushes `PUT /hardware/override` after start.

---

## 9. Keeping this file small

Target ≤ 200 lines, not counting the generated module table. No decision log here — one ADR per file under `docs/decisions/`. No duplication with
`docs/`; link instead. When they disagree, the linked doc wins and this file gets fixed.
