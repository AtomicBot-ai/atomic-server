# Roadmap

The scaffold (iteration 1, 2026-09-24) ships the command tree, the server, the admin and the
build/release pipeline; every command that is not implemented yet is a stub that exits 3 and names its
iteration. This file is the plan behind those stubs. `src/cli/not-implemented.ts` is the machine-readable
half of it: a test keeps the registry and the command tree in sync, and `docs/commands.md` shows the
status of every command. Iterations are ordered by what unlocks the product's promise — *install an
engine, pull a model, run it, and it answers on an OpenAI-compatible API* — and each names what it depends
on. The words (server, engine, engine build, run, unload) are defined in [`concepts.md`](concepts.md).

## Where things stand

Working today: `start`, `stop`, `restart`, `status`, `logs`, `admin` (token login, live dashboard),
`tui` (what bare `atc` opens on a terminal: Overview, Logs, Config, Doctor, Commands), `config`, `doctor`,
`update --check`, `version`, `completion`, the hidden `daemon` and `host-step exec`. The server boots
the core in-process, pushes hardware facts to it, serves the web admin and runs the host-step loop. See
[`architecture.md`](architecture.md) for how the pieces fit.

Stubbed: `run`, `unload`, `models *`, `engines *`, `hardware *`, `api *`, `service *`, `update` (apply),
`start --foreground`, `logs --follow`, `status --watch`, `config engine.*`.

## Iterations

### Iteration 2 — a first model answering

The product's promise. **Goal:** on a clean server, `atc engines install`, `atc models pull <repo>` and
`atc run <model>` end with a working `http://127.0.0.1:1337/v1` — three steps, as in the desktop app.

- `engines install [engine]`: the llama.cpp build the core recommends for this hardware (the core's
  `POST /backends/:provider/install`), or a named `--build`; progress on the terminal.
- `models pull <owner/repo>`: a first version over the core's `downloadHfModel` (iteration 3 adds the
  catalog, resume and checksums).
- `run <model> [--engine]`: loads a downloaded model on the active engine of the running server — the one
  running now, else `engines.default` — and nothing else; a missing model, server or engine is an error
  naming the command to run first. `unload <model>` / `--all` stops it.
- `start --foreground` for Docker and systemd: the server in this process, SIGTERM unloads and stops
  cleanly; the service units already call it. Inside a container it serves engines that run in that
  container (llama.cpp with `--gpus`); managed runtimes stay host-only (see
  [Managed runtimes on a server](#managed-runtimes-on-a-server)).
- `api start|stop|status` over the core's `/server` routes; `api.autoStart` and `models.autoLoad` honoured
  at server start (`PublicServerKeeper`).
- Replace an idle server of an older `atc`/core after an upgrade instead of refusing to attach.
- `status --watch`, `logs --follow`, `config engine.<provider>.<key>` forwarded to `PATCH /settings/:provider`.
  `logs --follow` reads through `followLog` (`src/daemon/log-follow.ts`), which the TUI's Logs screen
  already uses.
- Terminal UI: the API card on Overview gets start/stop keys (`atc api start|stop`), a Models screen with
  run and unload, and the header the GPU the core found.
- **Done when:** the e2e suite installs an engine, pulls a small GGUF and runs it through the compiled
  binary on all five CI platforms, and a `curl` to `/v1/chat/completions` answers; `atc start
  --foreground` survives a SIGTERM without orphaning the engine.

### Iteration 3 — models

**Goal:** models come from the catalog or Hugging Face, with progress, and stay manageable.

- `CatalogClient` over `atomic-chat-model-catalog` (`catalog.json.gz`, MiniSearch index) and
  `atomic-chat-conf/models/recommended.json` (hardware tiers), cached under `<data>/atc/cache/` with ETag
  and a one-hour TTL, offline fallback.
- `ModelResolver`: `owner/repo`, `owner/repo:file.gguf`, catalog alias, `auto` by VRAM tier; `--quant`.
  GGUF only: a repository with no GGUF files is refused with a hint at `--engine tensorrt-llm`, whose
  models the core resolves and downloads itself (iteration 4b).
- `ModelInstaller` on atc's own downloader (`src/downloads/`) and the core's `ModelRegistry`
  (`@atomic-chat/core/models`): disk preflight through `POST /disk/available`, resume, sha256, `model.yml`, optional
  `mmproj`; progress on the terminal and as `atc:download` events for the admin and the TUI.
- `models search|pull|list|rm|info`; `api key show|set|rotate|clear` (the key is the core's
  `server.api_key` setting; a non-loopback API without a key is refused unless `--insecure-no-key`).
- Terminal UI: the Downloads screen and pulls from the Models screen (see [The terminal UI](#the-terminal-ui)).
- **Done when:** `atc models pull` resumes an interrupted download and refuses a wrong checksum;
  `atc models pull <alias>` works from a catalog alias; the admin's Models page lists installed models; a
  model can be pulled and run from the TUI with live progress.

### Iteration 4 — engines, hardware, the managed runtime

**Goal:** `atc engines install` prepares whatever an engine needs, including TensorRT-LLM through Docker,
with consent and privileges handled honestly; the core, not `atc`, knows the hardware. It lands in two parts: 4a waits for nobody; 4b follows the core's TensorRT
milestones (status, gates and server specifics under
[Managed runtimes on a server](#managed-runtimes-on-a-server)).

**4a — engines and hardware.**

- `engines list|status|rm` over the core's backend routes; `hardware show|refresh` reading what the core
  found. **Depends on the core:** the GPU and CPU probe (NVIDIA, AMD through `rocm-smi` and sysfs, Intel)
  moves into the core, which then owns both the hardware facts and the build choice for the desktop app
  and the server alike; `atc` drops its prober and the `PUT /hardware/override` push.
- Real elevation strategies: `sudo` on a terminal, `pkexec` in a desktop session, UAC on Windows (the
  table in `architecture.md`); they are testable against a fake helper before any recipe exists.
- `doctor`: read-only Docker, NVIDIA driver, Container Toolkit and WSL checks.

**4b — the managed runtime.**

- `engines install tensorrt-llm`: `POST /environments/probe` → print the `RequirementPlan` (`system_changes`, download
  and disk estimates, whether elevation, a sign-out or a reboot may follow, blockers) → consent → begin
  with one `request_id` per invocation, so a retried command joins the operation instead of starting
  another → follow `environment:operation` with a byte progress bar (the image is ~16 GB) → `ready`. A
  machine whose Docker already runs containers on the GPU is adopted as it is: no host step, no prompt.
- Consent binds a plan digest. Interactively `--yes` approves the plan just printed; for configuration
  management a new `--approve sha256:<plan>` approves only that exact plan, and a host that changed in
  between answers `MANAGED_PLAN_CHANGED` instead of running something else.
- The one privileged step goes through `atc host-step exec` and the elevation table; the helper runs the
  recipe the core exports, verifies its digest and never touches the control API. `relogin-required` has
  a server catch: the `docker` group must reach the **server's** process, which inherits its groups from
  whoever started it. After `usermod -aG docker` that takes a new login and then `atc restart`, or a
  restart of a system service (`SupplementaryGroups=docker` in the unit makes it immediate); a
  `systemd --user` service keeps its old groups until the user manager restarts. `engines install
  --resume <op>` re-probes and continues; the core never re-elevates blindly.
- Windows: the helper only enables WSL and the Virtual Machine Platform (UAC); after the reboot the next
  `atc start` resumes the same operation. The distribution is imported as the original user, so the
  server runs in that user's session — never elevated, never as a LocalSystem service.
- Managed engines get their own lifecycle: an update stages and verifies the candidate image, unloads the
  resident model, smoke-loads a model the person names, activates, and keeps the previous digest for
  rollback; `engines rm tensorrt-llm [--keep-models]` stops only owned containers and removes only owned
  data. The environment cannot be removed while an engine is installed, and nothing ever touches the
  system Docker, foreign containers, other WSL distributions or the driver. `engines install --cancel
  <op>` is cooperative: during an indivisible host step it is recorded and honoured at the next safe boundary.
- Models for a managed engine are not GGUF but Hugging Face safetensors snapshots. The core resolves a
  repository first — `config.json` architectures against the engine's list, the quantisation's minimum
  compute capability, weights plus a KV reserve against free VRAM — and refuses before any download, with
  the numbers; it then downloads into the scope's `managed-runtimes/artifacts/`, gated repositories with a
  token the core holds. So `models pull` branches on the engine, `models resolve <repo> --engine
  tensorrt-llm` prints the verdict, and `models list` shows both stores.
- `run --engine tensorrt-llm <repo>`: the session is a container published on `127.0.0.1`, the public
  API forwards to it as it does to `llama-server`, the routes are those the adapter declares (chat,
  completions, responses), and `config engine.tensorrt-llm.*` carries context length, output limit and
  the KV-cache fraction.
- **The residency rule** sits above every engine's own auto-unload: before any local GPU load (llama.cpp
  CUDA or Vulkan, sd.cpp, a managed container) the core stops every other GPU session of the scope,
  generating or not, and waits for confirmed exit. Once the core applies it (card T11b) it holds on servers
  with no managed engine too: an image job on sd.cpp unloads the chat model on the same GPU. `run` says
  what it is about to evict; `status` and the admin show it. The desktop app's core on
  the same machine is an external consumer: neither evicts the other, and a clash ends in
  `OUT_OF_MEMORY`. One GPU per model at first.
- **Depends on the core:** the upstream milestones M1–M2 (Docker executor and watchdog, Linux and Windows
  provisioning, model resolution and download, the TensorRT adapter), `feat/tenzor-rt` merged over 0.5.x,
  and the host-facing changes listed under [Cross-cutting work](#cross-cutting-work). `atc` targets that
  core version exactly.
- Terminal UI: an Engines screen; installing an engine that needs system changes shows the operation as
  a stepper, the same one as `atc engines install`.
- **Done when:** on Ubuntu 24.04 with an NVIDIA card, `atc engines install tensorrt-llm` ends in `ready`
  with no prompt where a GPU Docker already works, and after one `sudo` prompt and one re-login on a clean
  box; `atc run --engine tensorrt-llm <repo>` answers on `/v1/chat/completions`; killing the server frees
  the GPU within the watchdog's limit.

### Iteration 5 — the admin pages

**Goal:** the browser front end catches up with the terminal one, for people who avoid terminals. (The
terminal UI shipped early, on 2026-09-25, and grows a screen per iteration instead.)

Admin pages, lifted from the desktop web-app where possible (`docs/admin-ui.md`):

- API Server (state, start/stop, key, trusted hosts), Models (installed, hub, downloads with progress),
  Engines (builds, optimal, install); `PATCH /api/config`; a password login so the admin may listen on a
  non-loopback address when a server has no SSH access.

- **Done when:** a model can be pulled and run from the browser, with live progress, and no front end
  offers anything that has no plain-command equivalent.

### Iteration 6 — service, update, doctor

- `service install|uninstall|status|start|stop`: systemd (user and system), launchd, a Windows logon task,
  with a wrapper-based Windows service to follow. For managed runtimes the system unit carries
  `SupplementaryGroups=docker` when Docker is present, so group access needs no re-login; on Windows the
  server stays in the user's session, because the WSL distribution is per user.
- `update` applies: download the asset for this platform, verify against `SHA256SUMS`, replace the binary
  (rename on POSIX, move-aside on Windows), re-exec, tell a managed service to restart. A managed model
  unloads across the restart and loads cold again; `update` says so before it starts.
- `doctor` completes (proxy reachability, engine and model sanity), coverage floors in CI.
- **Done when:** a fresh server goes from the installer to a service that survives a reboot, and
  `atc update` upgrades it in place.

### Iteration 7 — the admin's engine install wizard, logs, settings, hardware

- The managed-runtime wizard in the browser (`SetupState` stepper on live operations: requirements and
  system changes, authorization, sign-out or restart, image download, verification), a model picker with
  the core's compatibility verdict (curated tiers, a pasted repository), the server log with live tail,
  settings (proxy, telemetry, tokens), the hardware page with live GPU usage.
- **Done when:** iteration 4's `engines install tensorrt-llm` can be driven end to end from the browser, including the
  elevation prompt shown as instructions when it cannot be automated.

### Iteration 8 — signing and notarisation

- Sign the macOS binaries and notarise them, sign the Windows binaries, on the same recipe atomic-agent
  uses; the installer verifies the signature before swapping the binary in.

## The terminal UI

Bare `atc` on an interactive terminal opens a full-screen, keyboard-driven screen on
[Ink](https://github.com/vadimdemedes/ink) (React for the terminal), the stack atomic-agent's TUI is
built on; `atc tui [--screen <name>]` opens it explicitly. Without a terminal (a pipe, systemd, cron,
`docker run` without `-t`) or with `--json`, bare `atc` prints help and exits 2, and `atc tui` exits 2
naming `atc status --json` and `atc admin`. It is a front end over the server, never the only one:
everything it does exists as a plain command, it holds no lease, starts nothing on its own, and leaving
it never stops the server. The decision and its limits are in
[the ADR](decisions/2026-09-25-open-the-terminal-ui-by-default-on-a-terminal.md).

### What it looks like

```
╭───────────────────────────────────────────────────────────────────────────────────────────────╮
│        ▄▄                                                                                     │
│   ▄█▄  ██  ▄█▄      Atomic Server                                                             │
│    ▀████████▀       Local models behind an OpenAI-compatible API                              │
│  ▄▄▄████████▄▄▄                                                                               │
│  ▀▀▀████████▀▀▀     atc 0.1.0 · core 0.5.1                                                    │
│    ▄████████▄       ● server up 2h 14m · API http://0.0.0.0:1337/v1                           │
│   ▀█▀  ██  ▀█▀      data /home/u/.local/share/atomic-chat-cli/data                            │
│        ▀▀           a web admin  ? keys  q quit                                               │
╰───────────────────────────────────────────────────────────────────────────────────────────────╯
 1 Overview   2 Logs   3 Config   4 Doctor
╭───────────────────────────────────────────────────────────────────────────────────────────────╮
│ ● Server              pid 4121 · up 2h 14m · started 2026-09-25 09:27                         │
│                       data folder /home/u/.local/share/atomic-chat-cli/data                   │
│ ● Core                0.5.1 · instance 26ff4101… · protocol 1 · pid 4121                      │
│ ● API                 http://0.0.0.0:1337/v1 · key required · pid 4121                        │
│ ● Loaded models       qwen3-8b · llamacpp-upstream · :8001 · pid 4180                         │
│   Pending host steps  none                                                                    │
│ ● Admin               http://127.0.0.1:1338 · atc 0.1.0 · a for a login link                  │
╰───────────────────────────────────────────────────────────────────────────────────────────────╯
11:41 server started
S stop  R restart  a admin link  r refresh  ←→ screens  ? help  q quit
```

- **Welcome:** on every screen, when the terminal has at least 64 columns and 24 rows, a box greets you
  the way Claude Code does: the Atomic Chat logo in half blocks (the "/" bar brighter, as it lies on top
  in the real mark), the product name *Atomic Server*, versions, the server's state and the first keys.
  Only the terminal's size decides it, never the tab or an overlay, so switching screens moves nothing;
  every screen and overlay fits the 9 lines left under it at 80×24. **Header:** on a smaller terminal,
  one line instead: `✳ Atomic Server · atc … · core … · server up …` (the GPU joins in iteration 2).
  **Tabs:** in the order below; `←`/`→` go round them, `1`–`4` jump, Tab steps. **Status line:** a
  spinner while something runs, else the last thing that happened. **Footer:** only the keys that apply
  now, always visible; `?` lists them all.
- **Overview (now):** the admin dashboard's cards in its order and words — Server, Core, API,
  Loaded models, Pending host steps, Admin — one line each. `s` starts a stopped server (`atc start`),
  `S` and `R` stop and restart after a y/n question (`atc stop`, `atc restart`), `a` shows the admin
  login link (`atc admin --no-open`) and `o` opens it in a browser.
- **Logs (now):** the server log's tail with level colours, following new lines; `↑↓`, `PgUp`/`PgDn`,
  `g`/`G` scroll, `f` toggles follow, `/` filters.
- **Config (now):** every field with its value and source; Enter flips a boolean, moves an enum on, or
  edits a value inline (`atc config set`); `u` resets it (`atc config unset`). A value an environment
  variable overrides is marked, and a change while the server runs says to restart it.
- **Doctor (now):** the `atc doctor` checks with their marks and hints; `r` runs them again.
- **Commands (now):** every command grouped as in `atc --help`, with whether it works yet or the
  iteration it lands in; Enter shows its full help — the same text `atc <command> --help` prints, rendered
  from the same specs. The screen runs nothing; commands run in a shell.
- **Models (iteration 2, pulls in 3):** downloaded models with size, quantisation, running state and
  port; `r`/`u` run and unload (`atc run`, `atc unload`), `p` opens a pull prompt (catalog search with the
  same resolver as `models pull`), `d` deletes after a confirmation. A pull shows a progress bar, rate and
  ETA in place and moves to Downloads.
- **Downloads (iteration 3):** every transfer with progress, pause and cancel (`x`), errors with the same
  hints the CLI prints.
- **Engines (iteration 4):** installed engines and builds, the running one, install and remove; an engine
  that needs system changes shows the install as a stepper (the `SetupState` machine from
  `src/engines/managed-environment.ts`); when a step needs elevation it shows the exact command to run in
  another shell and waits, exactly like the CLI's `manual` strategy.

### How it is built

- `src/tui/`: `run-tui.tsx` renders `workspace/WorkspaceApp.tsx`; `state.ts` (the server reducer) and
  `controller.ts` (the only side effects) sit under it. `workspace/` keeps the shell at its root (state,
  controller, frame, input, actions) and one folder per area: `draw/`, `chat/`, `setup/`, `library/`,
  `operations/`, `server/`. The command loads it with a dynamic `import()`, so plain commands never load
  React.
- Data: `watchDaemon` (`src/core-link/watch.ts`) attaches when a server runs, follows its events
  (snapshot first; `STATUS_EVENTS` refetch), and attaches again after a restart, found by `health()`.
  Actions go through the functions the commands use: `startDaemon`/`stopDaemon`, `setConfigValue`,
  `runChecks`, `followLog`. No URL, token or HTTP outside `src/core-link/`, and nothing written to
  stdout or stderr around the frame (attach takes the UI's logger).
- Rendering: Ink's alternate screen (the shell's scrollback returns untouched), rounded box frames, the
  16 named colours, off under `NO_COLOR`, `--no-color` or a non-colour terminal. Every card and log line
  is one line, cut with `…` at the frame, and lists render only what fits, since Ink cannot clip a frame
  taller than the terminal; below 40×12 the screen asks for a bigger terminal.
- Tests: pure tables for the reducer, keys (every footer hint must do something) and model; the Ink app
  on `test/helpers/fake-terminal.ts` (a TTY-like stdin and stdout of a fixed size); the controller on the
  fake `CoreLink`; a contract test that bare `atc` on a terminal opens it and `q` leaves with the server
  running; Ink itself under Node and `bun test` (runtime-compat); and the compiled binary in a real
  pseudo-terminal (e2e, POSIX). Windows Terminal is checked by hand.

## Managed runtimes on a server

TensorRT-LLM (vLLM and SGLang later, on the same infrastructure) is designed in the desktop app's
repository: architecture, flows, coding contracts and a 72-card backlog are on `Atomic-Chat@feat/tenzor-rt`
in `docs/decisions/2026-09-22-*` (TensorRT-LLM and shared managed-text infrastructure) and the 2026-09-23
amendment "Preserve deployment seams for a future containerized core"; the code lands on
`atomic-chat-core@feat/tenzor-rt`. Those documents name "the CLI core" as the app's peer; `atc` is that
scope. This section is what they mean on a server.

### How it runs

- The core owns everything but the privileged step: probe, plan, operation store, image pull by digest,
  containers, their journal, recovery, the residency rule. One pinned upstream image
  (`nvcr.io/nvidia/tensorrt-llm/release`, ~16 GB, never `latest`) is described by a descriptor that
  `atomic-chat-conf` publishes under `runtimes/`: image and entrypoint digests, host recipes, supported
  architectures, the quantisation matrix, curated models, minimum versions.
- Linux uses the system Docker Engine, adopted as it is when `docker run --gpus` works, otherwise
  installed by one enumerated host action, `linux.install-container-runtime` (vendor repositories,
  `docker-ce`, `containerd.io`, `nvidia-container-toolkit`, `nvidia-ctk runtime configure`,
  `docker.service`, the user into `docker`). It removes nothing and never installs the NVIDIA driver,
  which stays a prerequisite. Windows uses an owned WSL2 distribution with its own Docker, driven through
  `wsl.exe -d <distro> --exec`; no Docker Desktop, and other distributions are left alone.
- A model container gets no Docker socket, no privileged mode, `--restart=no`, read-only model and
  entrypoint mounts, a bounded `--shm-size`, one GPU and a port published on `127.0.0.1` only.
  `trtllm-serve` enforces no API key: `atc`'s key protects port 1337, not the engine's loopback port,
  which any local user of a shared host can reach.
- A watchdog, not a supervisor: the container's entrypoint is a verified shell script that kills
  `trtllm-serve` once the heartbeat file the core touches every few seconds goes stale, and it cannot be
  switched off. A dead daemon frees the GPU within the limit; the next one reconciles the journal before
  offering a session. There is no policy yet for handing a running container to the next daemon, so
  `atc restart` and `atc update` unload a managed model and `models.autoLoad` brings it back cold;
  `atc stop` is a full exit and stops owned containers.
- The environment is one per machine user, in `<dataDir>/atomic-managed-runtimes/` (outside every data
  folder; `ATOMIC_CORE_MANAGED_ROOT` for tests) and shared with the desktop app's core; containers,
  journals, caches and model snapshots stay per scope in `<data>/atomic-core/managed-runtimes/`. Mutations
  take a file lock in the shared root, and the host-step executor already acts only on its own core's
  operations, so a machine running both never shows two prompts.

### Topologies

| `atc` runs | Engines run | Status |
| --- | --- | --- |
| On the host: a login session or systemd | In the system Docker | The upstream Linux path; iteration 4b |
| On Windows, in the user's session | In the owned WSL distribution | The upstream Windows path; iteration 4b |
| In a container (`atc run`, `--gpus`) | Inside that container (llama.cpp) | Iteration 2; no managed runtime |
| In a container with the host's Docker socket | As sibling containers | Deferred by the core's 2026-09-23 amendment |

The last row is what "run it in Docker" usually means, and nothing supports it yet. The Linux probe would
read the `atc` container instead of the host. The engine publishes on the host's loopback, which the
container cannot reach, and a session carries only a port the core accepts on `127.0.0.1`. Bind sources
must be paths in the Docker daemon's namespace, not the container's. And the socket makes the container
root on the host. `--network host` with identical paths looks like a shortcut and still reads the wrong
machine. The core kept seams for it without touching any wire or storage format — a `ManagedDeployment`
that adds publication and heartbeat to an engine's launch spec, a `MountSourceResolver` into the daemon's
namespace, an executor-resolved internal `BackendTarget { base_url }` — and lists what a server
deployment still has to decide: where the controller runs, Docker privileges, authentication, network
exposure, storage mapping, update and rollback, restart ownership. `atc` answers the first (a host
service); the rest is a joint design with the core after 4b.

### Server specifics to handle

- **Distributions.** Automatic install is qualified on Ubuntu 24.04 only; elsewhere the plan is
  `prerequisite-blocked` with instructions. Today the allowlist also blocks *adopting* a working GPU
  Docker on Debian, RHEL or a newer Ubuntu — the first live inventory ran on Ubuntu 26.04 and was blocked
  by exactly that.
- **Root and group-less access.** A daemon running as root, or reaching the socket through an ACL, has
  Docker without the `docker` group, yet the probe reads `id -nG`, reports the group missing and plans to
  add root to it.
- **The `docker` group is root on the host.** The consent text says so; the documented server setup is a
  dedicated service user.
- **Two users, one Docker.** The environment is per machine user, the Linux Docker Engine per machine: a
  desktop user and an `atc` service user get two environment records whose locks do not see each other.
- **Freshness across cores.** A core's snapshot reflects its own changes only; after the desktop app
  finished a setup, `atc` learns it from a probe, so `engines status` and `engines install` always probe first.
- **Disk and network.** The image lands in Docker's data root (`docker info` → `DockerRootDir`), not the
  data folder, so the plan and `doctor` measure there. Pulls use the Docker daemon's own proxy settings,
  not `atc`'s, and need `nvcr.io`; an air-gapped host has no path yet (pull by digest only).
- **Hardware and scope.** Ampere or newer; NVFP4 needs Blackwell (sm100/sm120), FP8 Ada or newer, Ampere
  gets W4A16 only. Out of the first release: multi-GPU inference, ARM, macOS, Podman, rootless Docker,
  Windows 10; Windows Server is not a baseline.

### Upstream status, 2026-09-25

`atomic-chat-core@feat/tenzor-rt` is at `632b934`, package 0.3.0, 42 commits behind the core's `main`
(0.5.1); the app's backlog has 19 of 71 cards done. **Done:** wire contracts and error codes, descriptor
parsing and canonical hashing, managed data paths, nullable-PID sessions and control protocol 2, the
operation reducer, CAS store, recovery, service, `/environments` routes, snapshot and SSE, the Linux and
Windows probes, the pure residency policy, immutable model artifacts. **Next:** T01e, the deployment seams
above. **Not started:** the Docker executor and watchdog, both installers, model resolution and download,
the adapter and lifecycle, update and removal. `provisionerFor()` still answers null everywhere. Hardware
evidence is pending: the Ubuntu host turned out to be an 8 GB RTX 4070 Laptop on Ubuntu 26.04 (the plan
assumed 12 GB), and neither the Windows run nor the RTX 5090 has happened.

## Cross-cutting work

- **Core changes still needed** (each a branch and a PR into `main`, then an exact pin bump here):
  - a `host` field in the lock record so a client can tell an `atc` daemon from the core CLI's without
    `daemon.json`; `mmproj` in `downloadHfModel`;
  - **the install recipe as data in the core** (backlog card T08b), with `recipeFor(recipe_id)` and its
    canonical digest exported through `./host`. The backlog puts the recipe's steps inside the app's Rust
    `pkexec` helper (T08c); then `atc host-step exec` cannot produce a receipt whose `recipe_digest`
    matches without re-implementing Rust in TypeScript. Raise it before T08b/T08c are coded;
  - the step's parameters on `ManagedHostStep`, or a documented derivation (Linux: `{ user }`);
  - host facts on `AtomicCore.create` (`user`, `originalUser`, `elevatedUser`), which the Windows probe
    already expects its host to supply (T09a);
  - `assessLinux`: the distribution allowlist gates the install only, not adoption; root or a reachable
    daemon without the group counts as access; the two probe defects the Ubuntu run found (T03c);
  - the entrypoint script (T07b) materialised by the core from an embedded copy, so a single-binary host
    needs no packaging of its own — otherwise `atc` embeds it the way it embeds the SPA;
  - the descriptor's `minimum_app_version` (T20a) defined for a host that is not the desktop app;
  - the free-disk check made on Docker's data root; the snapshot refreshed from the shared store;
  - a core-held Hugging Face token a host can set, for gated repositories (T13b);
  - the merge of `feat/tenzor-rt` over 0.5.x, which also brings control protocol 2.
- **Core release automation:** the `NPM_TOKEN` secret in the core repository makes its release workflow
  publish `@atomic-chat/core` by itself.
- **Core CI stability:** three runner flakes (Bun 1.3.10 segfault in `bun test` on macOS, the diffusion
  service test under coverage, the llama runtime load timeout on Windows arm) cost several reruns per
  release; raise those timeouts or retry those cases.
- **Windows service:** Bun binaries are not SCM-aware; a wrapper (WinSW or NSSM) or a small native shim
  is a decision for iteration 6. A wrapper running as LocalSystem cannot see the user's WSL distribution,
  so it would rule out the managed runtime on that machine.
