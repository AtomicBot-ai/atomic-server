# eye-cli

Atomic Server provides a web interface and terminal UI for the same local inference server. Both
support keyboard and mouse controls and share onboarding, downloads, models, and server status.
The executable is named **`atc`**.

On a fresh profile, the intro waits at **Choose engine**. Open the engine picker and select an engine
to start its installation. When installation finishes, the intro waits at **Press any key** before
model selection. If an engine is already installed, unfinished onboarding starts at **Press any key**.
Completed onboarding resumes the workspace in either interface.

This repository continues the terminal work built on
[`atomic-chat-cli`](https://github.com/AtomicBot-ai/atomic-chat-cli). Build from source with Bun and Node 22:

```sh
git clone https://github.com/AtomicBot-ai/eye-cli.git
cd eye-cli
bun install --frozen-lockfile
npm run build:ui
npm run embed:ui
npm run build
node dist/bin.js
```

Use `npm run build:bin` to create a standalone executable for the current platform in `dist/bin/`.
The terminal needs at least 54 columns and 24 rows. **Ctrl+Q** closes the interface; accepted downloads
and the background server continue. **Ctrl+K** shows shortcuts.

## Server foundation

**Atomic Server** keeps models on a machine — Linux, Windows or macOS, usually a headless server — and
serves them over an OpenAI-compatible API on `http://127.0.0.1:1337/v1`. Its command is **`atc`**. It
embeds [`atomic-chat-core`](https://github.com/AtomicBot-ai/atomic-chat-core) as a library and ships as
one binary per platform, with no engine inside: engines are installed on demand, and the core picks the
build for the hardware. The same server has a web admin on `127.0.0.1:1338` and a terminal UI (bare `atc`)
for people who would rather not type commands. Atomic Server and the Atomic Chat desktop app are separate
products for different audiences: they share the core (and the core's per-user managed-runtime root) and
nothing else. The words used everywhere — server, engine, engine build, model, run, unload — are defined
in [`docs/concepts.md`](docs/concepts.md).

> **Status.** The server, its lifecycle and supervision, the terminal UI (chat, server console, model
> and engine setup), the API with its keyring, the web admin's dashboard, installers, updates and the
> release pipeline work. Commands marked **stub** below parse their flags and print their help, but exit
> with code 3 (`ATC_NOT_IMPLEMENTED`) and name the iteration that brings them; the terminal UI already
> does what most of them will. [`docs/commands.md`](docs/commands.md) is generated from the command specs
> and is the authoritative list.

## Quick start on a server

```sh
curl -fsSL https://github.com/AtomicBot-ai/eye-cli/releases/latest/download/install.sh | sh
```

On Windows, in PowerShell: `irm https://github.com/AtomicBot-ai/eye-cli/releases/latest/download/install.ps1 | iex`.

The installer downloads the release's `SHA256SUMS`, picks the binary for this machine — the CPU, musl on
Alpine, a baseline build for x64 CPUs without AVX2, arm64 under Rosetta — verifies it (and refuses when it
cannot), puts it in `~/.local/bin/atc` (`%LOCALAPPDATA%\atc\atc.exe` on Windows) and adds that directory to
`PATH`. `ATC_INSTALL_DIR`, `ATC_VERSION` (a tag, e.g. `v0.1.0`), `ATC_NO_PATH=1` and `ATC_REPO` override the
defaults. The macOS and Windows binaries are signed (Developer ID with notarisation, Authenticode), and every
binary carries a build provenance attestation (`gh attestation verify atc-… -R AtomicBot-ai/eye-cli`).

### Linux packages

On Debian, Ubuntu, Fedora, RHEL-compatible systems and Arch, `atc` also comes as a package, and the package
manager then updates it with the rest of the system. A package carries the same binary as the release (on
x86-64 the baseline build, so it runs on any x86-64 CPU) and the shell completions. The repository and the
rpm packages are signed with the Atomic Chat packages key in
[`packaging/atomic-chat.asc`](packaging/atomic-chat.asc), fingerprint
`1047 F119 58C6 442D D472  E497 E4C3 D361 FB7F F123`.

Debian, Ubuntu (x86-64, arm64):

<!-- install:apt -->

```sh
curl -fsSL https://atc-packages.fsn1.your-objectstorage.com/atomic-chat.gpg | sudo tee /usr/share/keyrings/atomic-chat.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/atomic-chat.gpg] https://atc-packages.fsn1.your-objectstorage.com/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/atomic-chat.list
sudo apt update && sudo apt install atc
```

Fedora, RHEL, Rocky, Alma (x86-64, aarch64):

<!-- install:dnf -->

```sh
sudo curl -fsSL -o /etc/yum.repos.d/atomic-chat.repo https://atc-packages.fsn1.your-objectstorage.com/rpm/atc.repo
sudo dnf install atc
```

Arch Linux: `yay -S atc-bin`, or any other AUR helper.

Updates come with `sudo apt upgrade`, `sudo dnf upgrade` or `yay -Syu`; `atc update` refuses on a packaged
install and names the command to use. After an upgrade, `atc restart` (or `atc service restart`) moves a
running server onto the new binary. `sudo apt remove atc`, `sudo dnf remove atc` or `sudo pacman -R atc-bin`
removes it and leaves the data folder. The repository keeps the last ten releases; older ones are on the
[releases page](https://github.com/AtomicBot-ai/eye-cli/releases) as `.deb` and `.rpm` files.

```sh
atc                  # on a terminal: the terminal UI — choose an engine, then a model
atc service install  # keep the server running: systemd, launchd or a scheduled task; back after a crash
atc status           # pid, versions, API endpoint, running models, admin URL   (--json for one document)
atc api start        # the OpenAI-compatible API; every client needs a key from atc/client-keys.json
atc admin            # prints http://127.0.0.1:1338/#token=… and opens a browser
atc update           # the next release, checked against SHA256SUMS and the signature (packages: apt/dnf/yay)
atc doctor           # versions, data folder, config, ports 1337/1338, PATH, GPU driver
```

`atc start` / `atc stop` run the server in the background without a service; `atc start --foreground`
runs it in place (containers). `atc logs [-f]` shows the server's own log, rotated by size.

## Commands

| Group | Command | What it does | Status |
| --- | --- | --- | --- |
| Server | `atc start` / `stop` / `restart` | The server: core, API and web admin in the background; `start --foreground` runs it in place | works |
| Server | `atc status` | The server, the API endpoint, running models, the admin URL | works (`--watch` is a stub) |
| Server | `atc logs` | Tail of the server log; `-f` follows it | works |
| Models & engines | `atc run <model>` / `atc unload <model>` | Start a downloaded model on an engine (`--engine`; a managed engine shows its load stages); stop it | works |
| Models & engines | `atc models catalog\|search\|check\|files\|pull\|list\|rm\|import\|info\|logs` | The catalog, the model files, and with `--engine` the managed engines' and Foundry Local's models | works (see [Models for managed engines](#models-for-managed-engines), [Foundry Local](#foundry-local)) |
| Models & engines | `atc engines list\|install\|status\|rm` | Engines (llama.cpp, MLX, Foundry Local, the managed TensorRT-LLM, vLLM and SGLang) and their builds; installing one prepares what it needs | works (see [Managed engines](#managed-engines)) |
| Models & engines | `atc hardware show\|refresh` | What the core sees of the GPU and CPU | stub (iteration 4) |
| Access | `atc api start\|stop\|status` | The OpenAI-compatible API on the running server; clients need a key from the keyring | works |
| Access | `atc chat` | Send a message to an OpenAI-compatible model | works |
| Access | `atc api key show\|set\|rotate\|clear` | The keyring from the command line (the terminal UI manages it today; `--api-key` adds one) | stub (iteration 3) |
| Access | `atc admin [open\|status\|token]` | Sign-in link, where the admin listens, token rotation | works |
| Access | `atc tui` | The terminal UI, explicitly (what bare `atc` opens on a terminal) | works |
| System | `atc config get\|set\|unset\|list\|path` | `atc` settings, and engine settings of the running server's core | works |
| System | `atc doctor` | Diagnostic table with hints | works (GPU: NVIDIA only; Docker check skipped) |
| System | `atc service install\|uninstall\|status\|start\|stop\|restart` | The server as an OS service (systemd, launchd, Task Scheduler) | works |
| System | `atc update` | Self-update from GitHub Releases: checksum and signature checked, the server restarted onto it; a deb, rpm or AUR install is left to its package manager | works |
| System | `atc version`, `atc completion <shell>` | Versions; bash/zsh/fish/powershell completion | works |

Hidden: `atc daemon` (the server process itself, which `start` spawns) and `atc host-step exec
<request.json>` (the privileged helper for managed runtimes).

Bare `atc` opens the terminal UI only on an interactive terminal; in a pipe, a script, a service unit or
with `--json` it prints this help and exits 2, as before. Leaving the UI (`Ctrl+Q`) never stops the server.

Global flags go anywhere on the line: `--json`, `-v/--verbose`, `-q/--quiet`, `-y/--yes`,
`--data-folder <path>`, `--no-color`, `-h/--help`, `--version`. With `--json` a command prints exactly one
JSON document on stdout; an error is `{"error":{"code","message","details?","hint?"}}` on stderr.

Exit codes: `0` success, `1` runtime error, `2` usage (also bare `atc` and bare groups such as `atc models`),
`3` not implemented in this build, `130` interrupted.

## Managed engines

TensorRT-LLM, vLLM and SGLang run in a container the core manages: on the system Docker on Linux, in its
own WSL distribution on Windows (not on macOS). `atc` sets one up only after you agree to the core's plan:

```bash
atc engines install vllm                 # prints the plan, asks, then follows the setup to ready
atc engines install vllm --dry-run       # the plan only
atc engines install vllm --yes           # agree to the plan this command prints
atc engines install vllm --approve sha256:<digest>   # agree to that exact plan only (configuration management)
atc engines install --resume <operation> # follow it again, or continue after a sign-in or a restart
atc engines install --cancel <operation> # stops at the core's next safe boundary
atc engines status vllm                  # plan, blockers, installation, operation, update offer
atc engines rm vllm [--keep-models]      # the shared models stay while another managed engine is installed
```

The plan lists every system change (Docker, the NVIDIA Container Toolkit, the `docker` group), the
download and the disk it needs, whether one privileged step, a new sign-in or a restart may follow, the
blockers with the commands that fix them, and the plan digest your consent is bound to. Without a terminal
and without `--yes` or `--approve` nothing begins. The setup is a durable operation in the server: Ctrl-C
or `--detach` only stops following it. The privileged step runs through `atc host-step exec` — `sudo` in
your terminal, `pkexec` on a desktop, UAC on Windows, or a command `atc status` prints for you to run.
After you were added to the `docker` group the server needs a new sign-in and `atc restart` (`atc` never
signs anyone out or restarts the machine); the operation then continues. `atc engines install <engine>` on
an installed engine with a newer release updates it the same way, keeping the models.

## Models for managed engines

Managed engines run Hugging Face safetensors checkpoints from one store the core keeps for all of them
(`<data>/managed-models` on Linux, a folder in the WSL distribution on Windows). `atc` asks the core
whether a model runs here before it downloads a byte:

```bash
atc models check Qwen/Qwen3.5-2B                 # each managed engine's verdict, with the numbers
atc models catalog --engine vllm                 # the models the engine's release was measured with
atc models search qwen3 --engine sglang          # Hugging Face, narrowed to what could run here
atc models pull Qwen/Qwen3.5-2B --engine vllm    # verified download into the store; model.yml last
atc models pull --cancel <request-id>            # stop it; the same --request-id continues it later
atc models list                                  # a store model once, with every engine that lists it
atc run Qwen/Qwen3.5-2B --engine vllm
atc models rm Qwen/Qwen3.5-2B                    # through the core: it goes for every managed engine
```

A model downloaded once is there for every managed engine. The download runs in the server: closing the
terminal does not stop it, and a server restart shows it as interrupted until the same `--request-id`
continues it. Gated repositories need `HF_TOKEN` in the server's environment. `atc models pull <repo>`
of a repository without GGUF files names the engines that would take it.

## Foundry Local

Foundry Local runs ONNX variants of a model on the NPU, the GPU or the CPU through Microsoft's library,
where the core registers it (Windows x64/arm64, macOS 15+ on Apple Silicon, Linux x64/arm64 with glibc
2.28+). A variant runs only on a prepared accelerator; `atc` prepares them after the install, as the app
does:

```bash
atc engines install foundry-local                    # the build, then every accelerator it can prepare
atc engines accelerators foundry-local [--refresh]   # what the library found, prepared or not
atc models search gemma --engine foundry-local       # Atomic Chat's list, then Microsoft's catalog
atc models pull gemma-4-e2b-it --engine foundry-local [--device npu|gpu|cpu]
atc models pull --cancel <request-id> --engine foundry-local
atc run gemma-4-e2b-it-openvino-npu                  # a downloaded variant loads with foundry-local
atc models rm gemma-4-e2b-it-openvino-npu            # unloaded first, then its folder is deleted
```

Without `--device` the pull takes the NPU variant, then GPU, then CPU, among those that run here or will
once prepared, and downloads only one the core says runs (`ok`). Files come with sizes and sha256 from
Atomic Chat's list; a Microsoft catalog model is marked unverified. A download runs in the server into
`<data>/foundry-local/models/<variant>/`, continues across an expired Azure link, and writes `model.yml`
last. The list is cached for an hour; `ATC_FOUNDRY_LOCAL_MODELS_URL` names another one.

## Where data lives

```
<data> = <system data>/atomic-chat-cli/data      --data-folder or ATC_DATA_FOLDER override it
<data>/atomic-core/           the core: instance.lock, control-token (0600), settings.json, processes.json, logs/
<data>/llamacpp/models/       GGUF models, one folder with model.yml each (both llama.cpp providers)
<data>/<provider>/backends/   engine builds the core installs
<data>/atc/                   what only atc owns (owner-only ACL on Windows)
  config.json                 settings (0644, written atomically; unknown keys are kept)
  client-keys.json            0600: the API keyring, created when the server starts
  setup.json, chats/          0600: the terminal UI's setup and conversations
  run/daemon.json             pid, instance_id, state (starting|ready), atc/core versions, control_url, admin_url, started_at
  run/admin-token             0600: the admin login token
  run/host-steps/             0700: <step_id>.request.json (0600), <step_id>.result.json, journal.json
  logs/daemon.log             the server's own log, rotated by size (log.maxSizeMb, log.maxFiles)
  logs/daemon.out.log         the server process's output from its last start (crashes before the logger)
  cache/                      catalog and recommendation caches
```

`<system data>` is `$XDG_DATA_HOME` or `~/.local/share` on Linux, `~/Library/Application Support` on macOS
and `%APPDATA%` on Windows — the core's own rule, so the core and `atc` always agree. The desktop app's data
folder is refused: the two products never share models, settings or a lock.

## Configuration

Precedence: command flags > `ATC_<SECTION>_<KEY>` environment variables > `<data>/atc/config.json` >
defaults. `atc config list` shows every key with its value and where it came from.

```sh
atc config set api.port 1337              # written to config.json
ATC_API_HOST=0.0.0.0 atc status           # api.host from the environment for this run
atc config set models.autoLoad qwen3-8b,gemma-4b
atc config path
```

Keys are `api.*`, `admin.*`, `engines.*` (`engines.default` is the engine `atc run` falls back on),
`models.*`, `managed.*`, `proxy.*`, `update.*`, `telemetry.*`, `log.*` (the table is `src/config/schema.ts`). Engine parameters
(`engine.<provider>.<key>`, e.g. `atc config set engine.tensorrt-llm.context_length 16384`) belong to the
core of the running server: checked against the provider's schema, written with the revision read first,
applied from the next model load; `atc config list` shows those of the providers this host registers. The
engine build is not one of them: `atc engines activate`.
A config file written by a newer `atc` is refused with a hint rather than half-read; an older one is
migrated (version 2 dropped the `serve.*` keys along with the `serve` command; version 4 dropped
`api.requireKey`, since every API client needs a key from the keyring).

## Privacy

The server sends anonymous crash and error reports to Atomic Chat's error tracker: the error, the
versions and the platform — never prompts, replies, file paths, keys or personal data (the core scrubs
them before anything leaves). Reports are on by default, and the first `atc start` or terminal UI says
so once. Turn them off with any of:

```sh
atc config set telemetry.enabled false     # applies to the running server at once
```

```sh
export DO_NOT_TRACK=1                      # or ATC_TELEMETRY_ENABLED=false, for services and containers
```

## The web admin

```sh
atc admin                    # http://127.0.0.1:1338/#token=<admin token>, opened in a browser
atc admin status             # where it listens
atc admin token --rotate     # new token; old login links stop working
```

The admin listens on loopback only. The token in the URL fragment is exchanged once for an `HttpOnly`
cookie, so it never reaches a query string or a log. The core's control token never leaves the server: the
page talks to `/api/*` and the server proxies an allowlist of control routes. From another machine, forward
the port instead of exposing it:

```sh
ssh -L 1338:127.0.0.1:1338 user@server
```

`--host 0.0.0.0` is refused until the password login lands (iteration 5).

## Development

Prerequisites: Bun 1.3.10 (the package manager — `bun.lock` is committed — and the compiler of the binary)
and Node 22 (the development and test runtime; scripts run as `npm run …`, like in the core). The core is the
npm package `@atomic-chat/core`, pinned to an exact version (`docs/release.md`, "The core pin").

```sh
bun install                  # the pinned core and the admin-ui workspace
npm test                     # unit + contract projects on Node
npm run build:bin            # embeds the admin SPA (or the placeholder) and compiles dist/bin/atc-<triple>
npm run verify:fast          # lint, typecheck and the tests touched by uncommitted changes
npm run verify               # lint, typecheck, format, tests, UI tests, build, UI, binary, e2e, runtime-compat
```

To develop against a local core checkout, build it there (`npm run build`), run `bun link` in it and
`bun link @atomic-chat/core` here; `package.json` and `bun.lock` stay untouched and `bun install --force` puts
the pinned version back. `node dist/bin.js …` runs the CLI from source after `npm run build`; `npm run dev` in
`packages/admin-ui` runs the SPA against a server started with `atc admin --no-open`.

Note: the core's own CLI defaults its public API to port 6767; `atc` uses 1337, like the desktop app.

## Documentation

- [`docs/concepts.md`](docs/concepts.md) — the product's words: server, engine, engine build, model, run, unload
- [`AGENTS.md`](AGENTS.md) — working in this repository: map, rules, checklists
- [`docs/architecture.md`](docs/architecture.md) — processes, ports and tokens, the data folder, host steps
- [`docs/roadmap.md`](docs/roadmap.md) — the iterations behind the stubs, and the terminal UI design
- [`docs/commands.md`](docs/commands.md) — every command with its help text (generated)
- [`docs/testing.md`](docs/testing.md) — test layers, helpers, CI
- [`docs/release.md`](docs/release.md) — releasing, installers, self-update, the core pin
- [`docs/admin-ui.md`](docs/admin-ui.md) — the web admin SPA
- [`docs/decisions/INDEX.md`](docs/decisions/INDEX.md) — engineering decisions
- [`docs/project-review-2026-10-24.md`](docs/project-review-2026-10-24.md) — architecture, security, testing and production-readiness review

## License

Apache-2.0 ([`LICENSE`](LICENSE)). The web admin includes files from
[Atomic Chat](https://github.com/AtomicBot-ai/Atomic-Chat), also Apache-2.0; the attribution is in
[`NOTICE`](NOTICE). The binary bundles third-party packages, listed with their licenses in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) (`npm run notices` regenerates it; CI checks it is
current and that every license is on the policy in `scripts/licenses.mjs`).
