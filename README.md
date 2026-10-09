# eye-cli

Atomic Chat's terminal workspace: local conversations, model and engine installation, and an
OpenAI-compatible server console. Keyboard shortcuts and mouse controls share the same interface,
with an animated turquoise eye and layouts that adapt to the terminal window.

Choose Personal terminal for chat or Server console for API controls and credentials. First run installs
an engine and model before opening the workspace. The executable is still named **`atc`**.

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

> **Status: scaffold.** The command tree, help texts, config, server lifecycle, terminal UI, admin, build
> and release pipeline are real. Commands marked **stub** parse their flags and print their help, but
> running one exits with code 3 (`ATC_NOT_IMPLEMENTED`) and names the iteration that implements it.
> [`docs/commands.md`](docs/commands.md) is generated from the command specs and is the authoritative list.

## Quick start on a server

```sh
curl -fsSL https://github.com/AtomicBot-ai/atomic-chat-cli/releases/latest/download/install.sh | sh
```

On Windows, in PowerShell: `irm https://github.com/AtomicBot-ai/atomic-chat-cli/releases/latest/download/install.ps1 | iex`.

The installer downloads the release's `SHA256SUMS`, picks the binary for this machine, verifies it, puts it
in `~/.local/bin/atc` (`%LOCALAPPDATA%\atc\atc.exe` on Windows) and adds that directory to `PATH`.
`ATC_INSTALL_DIR`, `ATC_VERSION` (a tag, e.g. `v0.1.0`), `ATC_NO_PATH=1` and `ATC_REPO` override the defaults.

Getting a model to answer takes three steps, as in the desktop app (iteration 2; stubs in this build):

```sh
atc engines install              # the engine build the core picks for this hardware
atc models pull Qwen/Qwen3-8B-GGUF
atc run Qwen/Qwen3-8B-GGUF       # starts it on the running server; `atc unload` stops it
```

What runs today:

```sh
atc                  # on a terminal: the terminal UI — Overview, Logs, Config, Doctor, Commands (? for keys)
atc doctor           # versions, data folder, config, ports 1337/1338, PATH, GPU driver
atc start            # the server (core, API, web admin) in the background; it outlives this command
atc status           # pid, versions, API endpoint, running models, admin URL   (--json for one document)
atc admin            # prints http://127.0.0.1:1338/#token=… and opens a browser
atc stop             # graceful; --force while other commands are attached, --kill after the timeout
```

## Commands

| Group | Command | What it does | Status |
| --- | --- | --- | --- |
| Server | `atc start` / `stop` / `restart` | The server: core, API and web admin in the background | works (`start --foreground` is a stub) |
| Server | `atc status` | The server, the API endpoint, running models, the admin URL | works (`--watch` is a stub) |
| Server | `atc logs` | Tail of the server log | works (`-f` is a stub) |
| Models & engines | `atc run <model>` / `atc unload <model>` | Start a downloaded model on the active engine; stop it | stub (iteration 2) |
| Models & engines | `atc models search\|pull\|list\|rm\|info` | The catalog and the model files | stub (`pull`: iteration 2; the rest: 3) |
| Models & engines | `atc engines list\|install\|status\|rm` | Engines (llama.cpp, MLX, TensorRT-LLM) and their builds; installing one prepares what it needs | stub (`install`: iteration 2; the rest: 4) |
| Models & engines | `atc hardware show\|refresh` | What the core sees of the GPU and CPU | stub (iteration 4) |
| Access | `atc api start\|stop\|status` | The OpenAI-compatible API on the running server | stub (iteration 2) |
| Access | `atc api key show\|set\|rotate\|clear` | The API key (a core setting) | stub (iteration 3) |
| Access | `atc admin [open\|status\|token]` | Sign-in link, where the admin listens, token rotation | works |
| Access | `atc tui` | The terminal UI, explicitly (what bare `atc` opens on a terminal) | works (Models and Downloads screens come with iterations 2–3) |
| System | `atc config get\|set\|unset\|list\|path` | `atc` settings | works (`engine.*` keys are a stub) |
| System | `atc doctor` | Diagnostic table with hints | works (GPU: NVIDIA only; Docker check skipped) |
| System | `atc service install\|uninstall\|status\|start\|stop` | The server as an OS service | stub (iteration 6) |
| System | `atc update` | Self-update from GitHub Releases | `--check` works; applying is a stub (iteration 6) |
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

## Where data lives

```
<data> = <system data>/atomic-chat-cli/data      --data-folder or ATC_DATA_FOLDER override it
<data>/atomic-core/           the core: instance.lock, control-token (0600), settings.json, processes.json, logs/
<data>/llamacpp/models/       GGUF models, one folder with model.yml each (both llama.cpp providers)
<data>/<provider>/backends/   engine builds the core installs
<data>/atc/                   what only atc owns
  config.json                 settings (0644, written atomically; unknown keys are kept)
  secrets.json                0600: hfToken, adminPassword
  run/daemon.json             pid, instance_id, state (starting|ready), atc/core versions, control_url, admin_url, started_at
  run/admin-token             0600: the admin login token
  run/host-steps/             <step_id>.request.json, <step_id>.result.json, journal.json
  logs/daemon.log             the server's stderr
  cache/                      catalog and recommendation caches (iteration 3)
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
(`engine.<provider>.<key>`) belong to the core's settings; forwarding them through `atc config` is a stub.
A config file written by a newer `atc` is refused with a hint rather than half-read; an older one is
migrated (version 2 dropped the `serve.*` keys along with the `serve` command).

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
and Node 22 (the development and test runtime; scripts run as `npm run …`, like in the core). The core comes
from the pinned companion archive in `vendor/`, including the terminal's installation and download fixes.

```sh
bun install                  # the vendored core and the admin-ui workspace
npm test                     # unit + contract projects on Node
npm run build:bin            # embeds the admin SPA (or the placeholder) and compiles dist/bin/atc-<triple>
npm run verify               # lint, typecheck, format, tests, build, UI, binary, e2e, runtime-compat
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
