# Concepts and names

One vocabulary for the code's user-facing text, the help, the terminal UI, the web admin and the docs.
When a word here and a word somewhere else disagree, this file wins and the other place gets fixed. The
decision behind it is [Name the product Atomic Server and align the commands with the app](decisions/2026-09-25-name-the-product-atomic-server-and-align-the-commands-with-the-app.md).

## Names

| Name | What it is | Where it appears |
| --- | --- | --- |
| **Atomic Server** | The product: it keeps models on a machine and serves them over an OpenAI-compatible API. | README, help, terminal UI, web admin, release notes, installers. |
| **`atc`** | The product's command, one binary per platform. | Every command line. Short on purpose: it is typed all day. |
| **Atomic Chat** | The desktop app. A separate product for a different audience; it shares the core and nothing else. | Only when comparing the two. |
| **the core** (`atomic-chat-core`, npm `@atomic-chat/core`) | The library both products embed: engines, models, the API. | Docs and code; users meet it as "core 0.5.1" in versions. |
| `atomic-server` | This repository's name on GitHub (`AtomicBot-ai/atomic-server`). | Source and release URLs. |
| `atomic-chat-cli` | The core's name for the data folder scope (`<system data>/atomic-chat-cli/data`), preserved across the repository rename. | Never as a product name. |
| `@atomicbot-ai/atc` | The private workspace package. | Nowhere user-facing. |

The desktop app can put a command of its own on `PATH` (its strings call it `atomic-chat-cli`); that is
the core's CLI, not `atc`. Both would own the same data folder, so `atc` refuses to attach to it
(`ATC_DAEMON_FOREIGN`) and says which one is running.

## The things a user deals with

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| **server** | Atomic Server's background process: the core, the API and the web admin in one process that owns the data folder. `atc start` / `stop` / `restart` / `status`. | "daemon" is its name in the code (`src/daemon/`, `atc daemon`), not in anything a user reads. |
| **engine** | What runs a model: llama.cpp, MLX, Foundry Local, and the managed engines TensorRT-LLM, vLLM and SGLang. The desktop app calls the family "Engine" too. | A model. |
| **engine build** | One installed variant of an engine for this hardware, e.g. llama.cpp b6000 CUDA 12.4. | The desktop app calls it "backend"; we do not, because "backend" means a server to most readers. |
| **model** | Weights in the data folder: GGUF for llama.cpp, a safetensors snapshot for TensorRT-LLM and MLX. Downloading a model does not start it. | A running model. |
| **running model** | A model loaded on an engine and answering through the API. `atc run <model>` starts it, `atc unload <model>` stops it — the desktop app's Run and Stop (its "Unload from memory"). | The server, which keeps running with no model. |
| **active engine** | The engine `atc run` uses when none is named: the one running now, else the one last chosen (`engines.default`). | The engine build, which the core picks. |
| **API** | The OpenAI-compatible endpoint, `http://<host>:1337/v1`, with an optional key. `atc api start` / `stop` / `status`, `atc api key`. The desktop app calls it "Local API Server". | The server as a whole. |
| **web admin** | The browser front end on `127.0.0.1:1338`, signed in with a link from `atc admin`. | The API. |
| **terminal UI** | The full-screen front end bare `atc` opens on a terminal (`atc tui`). | Plain command output. |
| **data folder** | Where everything lives: models, engine builds, config, logs (`--data-folder`). | The desktop app's folder, which is separate. |

## How the pieces divide the work

- **No engine ships inside `atc`.** Unlike the desktop app, the binary carries no engine build; `atc
  engines install` downloads one. The server runs fine with none, and says so.
- **The core knows the hardware and picks the build.** Which GPU and CPU this is, and which engine build
  is best for them, is the core's decision, the same one the desktop app gets. Today `atc` still probes
  the GPU and hands the facts to the core; that moves into the core (a core branch), after which
  `atc hardware show` only shows what the core found.
- **Where an engine runs is the engine's business.** A llama.cpp build runs as a plain process;
  the managed engines — TensorRT-LLM, vLLM and SGLang — run in a container on the system Docker (on
  Windows, in an owned WSL distribution). The core starts each engine the way it needs, talks to it and
  stops it; commands and screens look the same either way. Installing an engine that needs a container
  prepares that too (`atc engines install vllm`: the core's plan, your consent bound to its digest, then
  the one privileged step if any), so there is no separate setup command.
- **Every front end is a client of the server.** The commands, the terminal UI and the web admin offer
  the same actions through the same functions; none has an action the commands lack.

## Commands

The command tree (`src/commands/`) renders `atc --help`, [`commands.md`](commands.md), shell completion
and the terminal UI's Commands screen, so this table is the plan and those are the truth.

| Command | Does | Why this name |
| --- | --- | --- |
| `atc start` / `stop` / `restart` / `status` / `logs` | The server: start it in the background (`--foreground` for Docker and systemd), stop it, its state, its log. | "Start server" / "Stop server" in the app. |
| `atc run <model> [--engine <engine>]` | Start a downloaded model on the active engine of the running server. Nothing is downloaded or started on the side: a missing model, server or engine is an error that names the command to run first. | The app's Run button. |
| `atc unload <model>` | Stop a running model and free its memory; the server keeps running. | The app's "Unload from memory"; `stop` stays the server's alone, so a forgotten model name never stops everything. |
| `atc models search` / `pull` / `list` / `rm` / `info` | The catalog and the model files: find, download, list, delete, describe. | |
| `atc engines list` / `install` / `status` / `rm` | Engines and their builds: what is installed and running, install the build the core recommends (or a named one), remove one. | |
| `atc hardware show` / `refresh` | What the core sees of the GPU and CPU; probe again. | |
| `atc api start` / `stop` / `status`, `atc api key …` | The API endpoint and its key. | |
| `atc admin` | The web admin's sign-in link, address and token. | |
| `atc tui` | The terminal UI, explicitly. | |
| `atc config` / `doctor` / `service` / `update` / `version` / `completion` | Settings, checks, the OS service, self-update, versions, shell completion. | |

Gone before they shipped: `serve` (one step to a served model; `run` starts a model, the rest are
separate steps), the old `run` (the server in the foreground; now `start --foreground`), `models
load` / `unload` (now `run` / `unload`) and `setup` (now `engines install`, and `status` shows what is
set up).

## Words in text

- Say **server** for the background process, **the API** for the endpoint, **engine** and **engine
  build**, **run** and **unload** for a model, **start** and **stop** for the server and the API.
- Error codes keep the names they shipped with (`ATC_DAEMON_NOT_RUNNING`): they are an interface.
- The admin and the terminal UI name their cards the same way: Server, Core, API, Loaded models,
  Pending host steps, Admin.
