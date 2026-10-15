# Testing

Six layers, five of them vitest projects in `vitest.config.ts` and one in the admin package. Every layer
runs in an isolated data folder; none reaches the network or starts a real engine. A release served from
loopback stands in for GitHub wherever downloading is under test.

## Projects

| Project | Files | Runs | What it proves | Timeout |
| --- | --- | --- | --- | --- |
| `unit` | `src/**/*.test.{ts,tsx}`, next to the code, and `test/scripts/**` (the scripts' pure parts) | `npm test` | Pure policy by table: flag splitting, config parsers and precedence, elevation selection, `nvidia-smi` parsing, service templates, semver, the stub registry vs the tree, the TUI's reducer and key table. Fakes for I/O. The Ink app renders on `fake-terminal.ts` in Ink's debug mode (one full frame per write). | 5 s (20 s on Windows: the first PowerShell identity probe on a cold runner) |
| `contract` | `test/contract/**/*.test.ts` | `npm test` | `commands.test.ts`: commands against `FakeCoreLink` — what they print, what they call, how they fail. `daemon.test.ts`: `startDaemon` with a **real** `AtomicCore` in a temp folder — the lock and token the core writes, `daemon.json`, admin 401/204/200, the proxy allowlist (403), Bearer auth, SSE relay, attach + lease, the foreign-owner check, clean shutdown. | 60 s |
| `e2e` | `test/e2e/**/*.test.ts` | `npm run test:e2e` | The built program end to end in a temp data folder: `version --json`, `--help`, exit 2 for unknown commands, exit 3 + JSON error for a stub, `start --admin-port 0` → `status` → `admin status` → second `start` is a no-op → `stop`, `completion bash`. `tui.test.ts`: without a terminal `atc tui` exits 2 and bare `atc` prints help; in a 100×30 pseudo-terminal (Python's `pty`, POSIX only) bare `atc` opens the screen, answers keys, and leaves the alternate screen on `q` with exit 0. | 120 s |
| `installers` | `test/installers/**/*.test.ts` | `npm run test:installers` | `install.sh` end to end against a release served from loopback (`ATC_DOWNLOAD_BASE`), on a faked machine: shims for `uname`, `ldd`, `sysctl` on a sandboxed PATH and a fake `/proc/cpuinfo` (`ATC_CPUINFO`) — the table OS × CPU × musl × AVX2 × Rosetta → binary, a checksum mismatch and a missing sha tool installing nothing, the PATH line written once, the note when a Linux package's marker (`ATC_PACKAGE_MARKER`) says a packaged copy is shadowed. `install.ps1` on Windows with the built `atc.exe` as the asset. Spawns are asynchronous: the release is served from the test process. | 60 s |
| `runtime-compat` | `test/runtime-compat/**/*.test.ts` | `npm run test:runtime-compat` **and** `bun test test/runtime-compat` | The Node behaviours the daemon relies on, pinned under both runtimes: a detached `unref`ed child survives the parent, gzip/base64 round trip (the embedded assets), SSE chunks arrive one by one, and Ink renders, reads raw keys, follows `resize` and restores raw mode and the screen (`ink.test.ts`, no JSX). No setup file: it must not depend on the repo's test harness. | 60 s |
| `ui` | `packages/admin-ui` (its own vitest, jsdom) | `npm run test:ui` | Components and hooks of the SPA against a fake hub; see `docs/admin-ui.md`. | — |

`npm run test:coverage` runs unit + contract with v8 coverage over `src/**/*.{ts,tsx}`, excluding tests,
`index.ts` files, `src/contract/`, `src/bin.ts` and generated files. Coverage floors are iteration 6.

Beyond those rows: `test/contract/daemon-upgrade.test.ts` (a server of another build, faked by
`helpers/fake-old-owner.ts`: status, stop, start, restart reach it), `service.test.ts` (`atc service` against a
recording manager, `start --foreground` against a real core), `daemon-log.test.ts` (the server's own log),
`host-step.test.ts` (a request through the core's real executor, as under `sudo`). In e2e: `update.test.ts`
(the built binary updates itself from a loopback GitHub and restarts its server), and `service.test.ts`, which
installs, crashes and removes a real OS service — only with `ATC_E2E_SERVICE=1`, which CI sets (it changes
the machine).

The Linux packages are not a vitest project: they need real distros. `test/scripts/linux-packaging.test.ts`
covers their pure parts (asset names, versions, the PKGBUILD, which releases the repository carries, the
upload order, the README blocks), and the release workflow's `smoke-packages` installs each package in
clean Debian, Ubuntu, Fedora, Rocky and Arch containers with `scripts/smoke-linux-package.sh`, the
README's own commands and a repository of the draft on loopback (`docs/release.md` shows how to run it
locally with Docker).

## Isolation

`test/setup.ts` (unit, contract, e2e) sets, once per worker, `ATC_DATA_FOLDER` and
`ATOMIC_CORE_DATA_FOLDER` to subfolders of a fresh `mkdtemp`. Both `atc` and the core resolve their data
folder from these, so a test can never touch `~/.local/share/atomic-chat-cli` or the desktop app's folder.
`test/helpers/tmp-data-folder.ts` gives one folder per test on top of that.

## Helpers (`test/helpers/`)

| Helper | Gives you |
| --- | --- |
| `test-context.ts` — `testRun({ running?, io?, deps? })` | A complete command run: `recordingIo` (captured `out`/`err`, scripted `answers`), a temp `AtcPaths`, a `FakeCoreLink`, a `fakeHost()`, and `run(argv)` → exit code. `running: false` makes `attach` fail with `ATC_DAEMON_NOT_RUNNING` until a command asks to launch. |
| `test-context.ts` — `fakeHost(over?)` | `HostServices` with a non-root, no-TTY, nothing-on-PATH machine, an `exec` that cannot run anything, a `manual`-only elevator and a not-implemented service manager. Override fields per test. |
| `test-context.ts` — `fakeCoreFactory(link, { running })` | A `CoreLinkFactory` that records whether a command launched the daemon. |
| `fake-core-link.ts` — `fakeCoreLink(snapshotOverrides?)` | An in-memory `CoreLink`: records `calls` `{method, path, body}`, answers from a scripted `CoreSnapshot` (`snapshotValue`), counts `shutdowns`, and `emit(message)` pushes an event to subscribers. |
| `tmp-data-folder.ts` — `tmpDataFolder(prefix?)` | `{ paths, cleanup }` — a fresh `<tmp>/data` with `atcPathsFor` applied. |
| `fake-terminal.ts` — `fakeTerminal(columns?, rows?)` | TTY-like `stdin` (`press(data)`, `KEYS`) and `stdout` (`writes`, `lastFrame()`, `text()`, `resize()`) of a fixed size — Ink would otherwise ask the real terminal — plus `streams` for `AtcIo.terminal`, `stripTerminal()` and `eventually()`. |
| `deps.ts` | Type re-exports (`CoreLinkFactory`, `RunCliDeps`) so helpers import from one place. |
| `src/io.ts` — `recordingIo()` | The `AtcIo` tests use; lives in `src/` because commands are typed against it. |

The daemon contract test builds the real thing with `startDaemon({ …, host: fakeHost(), probeHardware:
false, admin: { enabled: true, host: '127.0.0.1', port: 0 }, telemetry: false })`: no `nvidia-smi`
spawn, a random admin port, and telemetry off.

## Running one project

```bash
npm test                                   # unit + contract
npx vitest run --project unit              # one project
npx vitest run --project contract test/contract/daemon.test.ts
npx vitest run --project unit src/host/elevator.test.ts -t 'selects'
npm run test:watch                         # unit + contract, watching
npm run test:e2e                           # needs a build, see below
npm run test:runtime-compat && bun test test/runtime-compat
npm run test:ui                            # the SPA
```

## The e2e prerequisite

`test/e2e/cli.test.ts` looks for `dist/bin/atc-<cpu>-<triple>[.exe]` for this machine and runs it; when
there is none it runs `node dist/bin.js`. Either way a build is required first:

```bash
npm run build && npm run test:e2e          # from source, through Node
npm run build:bin && npm run test:e2e      # the compiled binary (Bun 1.3.10)
```

The test starts a real daemon in a temporary folder and stops it with `stop --force --kill` in `afterAll`;
a failing run can leave a daemon behind for up to the stop timeout — `atc stop --data-folder <tmp>` if you
find one.

## The terminal UI by hand

CI drives the compiled binary in a pseudo-terminal on Linux and macOS only; Windows has no `pty` module and
the runners no ConPTY driver. Before a release, and after any change under `src/tui/` or to Ink, run the
Windows binary in Windows Terminal (and once in the legacy console): bare `atc` opens the screen, the
number keys and Tab switch screens, `↑↓` and Enter work on Config, a resize reflows, `q` leaves and the
prompt comes back clean. `atc | more` must still print help.

## `bun test test/runtime-compat`

The rule: the runtime-compat suite runs under vitest (Node) **and** under Bun's own test runner, so a
behaviour difference between Node 22 and the Bun release that compiles the binary shows up here first, not
in a user's daemon. The files import from `vitest` — Bun maps that to its own runner — and use nothing
from `test/setup.ts` or `test/helpers/`. Anything the daemon starts to depend on (signals, ports, streams,
child processes) gets a case here before it is used.

## What runs where (`.github/workflows/ci.yml`)

| Job | Runner | Steps |
| --- | --- | --- |
| `gate` | ubuntu-latest | `bun install --frozen-lockfile`, `lint`, `typecheck`, `format:check`, `build`, `gen-command-docs.mjs --check` (docs/commands.md must be current). |
| `ui` | ubuntu-latest | `bun install --frozen-lockfile`, `test:ui`, `build:ui`; uploads `packages/admin-ui/dist` as the `admin-ui` artifact. |
| `test` (needs `gate`) | ubuntu-latest, ubuntu-24.04-arm, macos-14, windows-2022, windows-11-arm | Bun 1.3.10 + Node 22, `bun install --frozen-lockfile`, `npm test`, `test:runtime-compat`, `bun test test/runtime-compat`, `build`, `build:bin`, `test:e2e`; uploads `dist/bin` per OS. |

The release workflow calls `ci.yml` (`workflow_call`) as its gate, so nothing is published that did not
pass all three jobs, including the binary e2e on native arm runners. `npm run verify` runs the same gates
locally, in order: lint, typecheck, format check, unit + contract, build, UI build, binary, e2e,
runtime-compat.

## Rules

- Every exported function has a unit test next to it; policy code is table-driven.
- Every user-visible flow has a contract test; once it works in the binary, an e2e case.
- A change in `src/daemon/` or `src/host/` is verified with `npm run test:e2e` on your OS — say which in
  the summary. Windows CI is mandatory for anything that spawns.
- Tests never sleep on wall-clock time to synchronise; they wait on the thing (a lock state, a response, an
  event). Timeouts are the ceilings above, not the mechanism.

## Terminal installation, credentials and history

`test/contract/terminal-onboarding.test.ts` walks the real Ink application with mouse and keyboard against scripted Core operations: whole-plate selection, engine catalog, model selection, reviewed installation, navigation gating, close/reopen, recovered progress, model load and explicit server start. `src/terminal-setup/service.test.ts` checks durable operation reuse, readiness and disk-space refusal. Data-store tests cover private key files, concurrent mutations, revocation, chat context across launches, rename and deletion.

The private macOS arm64 build was additionally exercised against live catalogs and a real llama.cpp engine (`b11463`, `macos-arm64`) with `ggml-org/stories15M-q4_0`: engine and model download, Core verification, load, authenticated `/v1/models`, a second named key, revocation returning 401, and streamed inference ending in `[DONE]`. This tiny model validates plumbing; it is not a quality recommendation. The test used a separate data folder and stopped its own background service afterward.

Before release, test this flow on Linux and Windows terminals, including clipboard support and third-party agent tool use.
