# Architecture

How `atc` is put together: processes, the data folder, ports and tokens, the daemon's life, the admin's
security model, and how a privileged host step runs. The code is the source of truth; where this page and
the code disagree, fix the page.

## Processes

```
 person ──▶ atc <command>       short-lived: parse argv, attach to the daemon, print, exit (seconds)
              │  re-execs itself as `atc daemon` (process.execPath) when nobody owns the data folder
              ▼
 atc daemon                     long-lived, one per data folder, outlives every command
 ├─ AtomicCore (in-process)     ownerScope 'cli'; control API /atomic/v1 on loopback, Bearer control-token,
 │    └─ engines (children)     SSE /events; llama-server & co as child processes;
 │                              public OpenAI-compatible API /v1 on :1337 (the core's public server)
 ├─ AdminServer  :1338          BFF + embedded SPA; admin-token → HttpOnly cookie;
 │                              /api/core/* proxy (the control-token stays here); SSE relay /api/events
 ├─ host agent                  hardware probe → PUT /hardware/override; HostStepExecutor
 │                              (pending_host_step → request file → helper → receipt)
 └─ run files                   <data>/atc/run/daemon.json, <data>/atc/logs/daemon.log, graceful shutdown
 privileged helper = the same binary: `atc host-step exec <request.json>` under root / sudo / pkexec / UAC
```

| Process | Lifetime | Responsibilities |
| --- | --- | --- |
| `atc <command>` | seconds | Parse, resolve paths and config, `attach` (or spawn) the daemon, hold a lease while it works, print one result, exit with a code. Never holds a URL or token outside `src/core-link/`. |
| `atc daemon` (hidden) | until `atc stop`, `POST /shutdown` or a signal | Owns the data folder through the core's lock. Runs the core in-process, the admin server, the hardware push, the host-step loop; writes `daemon.json`; cleans up on exit. Spawned by `start` and `admin`; run in place by `atc start --foreground` (containers, OS services). Users know it as "the server" ([`concepts.md`](concepts.md)). |
| engines | per session | Children of the daemon, journalled by the core in `processes.json`; a later owner reaps orphans. |
| `atc host-step exec` (hidden) | seconds | The privileged half of a managed-runtime step: file in, file out, no network. |

Crashes: the daemon is the core; they fall together. Recovery is the core's model — the next command
respawns, the new owner reaps orphans, managed operations recover from the core's store. Supervision
is the OS service manager (`atc service`) or the container runtime.

## OS services

`atc service install` puts `atc start --foreground --data-folder <data>` under the platform's manager
(`src/host/service-manager.ts` for the definitions, `service-plans.ts` for the steps):

| Platform | Per user | `--system` (root / elevated) | Restart |
| --- | --- | --- | --- |
| Linux | systemd user unit, `~/.config/systemd/user/<name>.service`; `loginctl enable-linger` keeps it after logout | `/etc/systemd/system/<name>.service`, `User=` from `--user` (default `SUDO_USER`) | `Restart=on-failure`, 5 s |
| macOS | LaunchAgent in `gui/<uid>` | LaunchDaemon, `UserName` from `--user` | `KeepAlive { SuccessfulExit: false }`, 5 s |
| Windows | scheduled task at the user's logon | scheduled task at boot as SYSTEM | `RestartOnFailure` every minute; no 72 h execution limit |

All three restart only after a failure. `atc stop` exits 0, so the server stays stopped until
`atc service start`, the next boot or logon. systemd and launchd stop with SIGTERM, which the server
treats as a graceful stop; a scheduled task has no signal, so `atc service stop|restart|uninstall` on
Windows stops the server through its control API first. `install` stops a server started by hand for
the same folder, so the service can take the lock. A system-wide service runs as another account than
the one that installs it, so the data folder is passed explicitly and printed. ADR 2026-10-09 "Run the
server under the OS service manager".

## The data folder

`<data>` is the core's CLI-scope folder, `<system data>/atomic-chat-cli/data`, resolved by the core's own
rules (`resolveCliDataFolder` from `@atomic-chat/core/host`): `--data-folder` > `ATC_DATA_FOLDER` > the
default. `assertCliDataFolder` refuses the desktop app's folder. The chosen path is not stored in the config
(the config lives inside it). `src/config/paths.ts` builds `AtcPaths`; the core's `dataLayout` covers the
rest.

```
<data>/atomic-core/{instance.lock, control-token, settings.json, credentials.json, processes.json, logs/, …}   the core
<data>/llamacpp/models/<id>/model.yml                                    models (the client — atc — writes these; iteration 3)
<data>/<provider>/backends/<version>/<backend>/                          engine packs installed by the core
<data>/atc/config.json            atc settings, 0644, tmp + rename; unknown keys preserved
<data>/atc/secrets.json           0600: hfToken, adminPassword
<data>/atc/run/daemon.json        {schema_version, pid, instance_id, state, atc_version, core_version, control_url, admin_url, started_at}
<data>/atc/run/admin-token        0600: 32 random bytes, base64url
<data>/atc/run/host-steps/        <step_id>.request.json, <step_id>.result.json, journal.json
<data>/atc/logs/daemon.log        the server's own log, timestamped lines, rotated by size (log.maxSizeMb, log.maxFiles → .1, .2 …)
<data>/atc/logs/daemon.out.log    the server process's stdout and stderr from its last start (crash output before the logger is up)
<data>/atc/logs/service.log       the same for a launchd service
<data>/atc/cache/                 catalog and recommendation caches (iteration 3)
```

The managed-runtime store is not here: it is the core's shared per-user root, and the core's decision.

## Ports and tokens

| Listener | Default | Bound to | Credential | Who holds it |
| --- | --- | --- | --- | --- |
| Core control API `/atomic/v1` | random port | loopback | `control-token` (Bearer) | The core writes it (0600). The daemon reads it from the facade; commands read it through `attachToOwner`. **Never** leaves the machine's processes: not in the browser, not in the helper, not in a log. |
| Public API `/v1` | 1337 | `api.host` (127.0.0.1) | A key from the keyring `atc/client-keys.json` (0600; owner-only ACL on Windows) | Clients of the model. The server creates the keyring when it starts (seeded from `ATC_API_KEY`), and the core checks it on every request on any address, so there is no keyless API. `atc api start --api-key` adds that key to the keyring. |
| Admin `/`, `/api/*` | 1338 (`0` = random, published in `daemon.json`) | loopback only | `admin-token` → session cookie | The daemon writes the token (0600); `atc admin` puts it in a URL fragment once; the browser keeps only the cookie. |

Two things reach the outside: the public API for model clients and the admin for people. The control API
and its token stay behind both, mirroring the desktop app's Rust bridge.

## A command attaches, or spawns

`src/core-link/attach.ts`, on top of the core's `attachToOwner`, `inspectLock`, `waitForPublishedOwner`:

1. `attachToOwner({ layout, clientName: 'atc', launch: false })`. A ready owner answers with its
   `CoreClient` and lock record; the core checks scope and version itself.
2. `CORE_NOT_RUNNING` and the command did not ask to launch → `ATC_DAEMON_NOT_RUNNING` with the hint
   `atc start`.
3. Otherwise `inspectLock`: if nobody owns the folder, spawn `atc daemon --data-folder <data>
   --control-port 0 [--no-admin] [--admin-port N] …` detached, `windowsHide`, stdin ignored, stdout and
   stderr to `atc/logs/daemon.out.log`, overwritten (a file, never a pipe the parent could close), then
   `unref`. The server writes and rotates `daemon.log` itself, so that file has one writer.
   If someone is already starting, just wait. Readiness is the core's lock: `waitForPublishedOwner`, 20 s.
4. Attach again, then read `atc/run/daemon.json`. Missing, or an `instance_id` that differs from the lock →
   `ATC_DAEMON_FOREIGN`: the owner is a core that is not an `atc` daemon (typically the core's own CLI
   daemon on the same folder, which has no admin and no host-step loop).
5. Build `HttpCoreLink` with `SseEvents` (snapshot, `/events` from the snapshot's cursor, backoff reconnect,
   re-snapshot on `resync` or on an `instance_id` change).

A command that changes state runs inside `link.withLease(name, work)`: `POST /clients`, heartbeat at the
interval the core returns, `DELETE` on exit. Components inside the daemon never register as clients —
otherwise `atc stop` would always need `--force`. `atc stop` posts `/shutdown { client_id, force? }` under
its own lease, waits up to 30 s for the lock to change hands, and only with `--kill` sends `SIGKILL`
(`taskkill /T /F` on Windows).

**A server from another build.** After an update the lock names another core version and the core's
attach refuses (`CORE_PROTOCOL_MISMATCH`). `src/core-link/stale-owner.ts` then talks to the old owner
directly with the lock record and the control token: snapshot, check the instance and its clients,
`/shutdown`, wait for the lock (with `--kill`, the pid the lock names; an unknown control protocol is
never spoken to). Without `launch` a command gets `ATC_DAEMON_OUTDATED`; `atc status` shows
`outdated: true` and exits 0; `start`, `restart` and launching commands replace it (refused while other
clients are attached, unless `--force`). A spawned server that dies while starting is reported as
`ATC_DAEMON_START_FAILED` with the last lines of `daemon.out.log`. ADR 2026-10-09 "Replace a server another
build left running".

## The terminal UI is a client

Bare `atc` on an interactive terminal (stdin and stdout TTYs, `TERM` not `dumb`, no `--json`/`--help`)
runs `atc tui`; anywhere else it prints help and exits 2. The UI is one more client of the same daemon, in
the foreground process, and changes nothing above:

- It attaches with `launch: false` and never holds a lease, so it neither starts a daemon on its own nor
  makes `atc stop` need `--force`. `watchDaemon` (`src/core-link/watch.ts`) follows the event stream and
  checks `health()` every 2 s: a daemon that stopped shows as down, and a restarted one (new control
  port, new token) is attached again, which `SseEvents` alone would not do.
- Its keys call what the commands call: `startDaemon` and `stopDaemon` under an `atc tui` lease
  (`src/core-link/lifecycle.ts`), `setConfigValue` (`src/config/edit.ts`), `runChecks`, and
  `followLog` for the daemon log (`src/daemon/log-follow.ts`).
- Ink owns the terminal while it runs (raw mode, the alternate screen), so nothing else may write to it:
  `CoreLinkFactory.attach` takes the UI's logger and its messages go to the status line. `q`, Esc, Ctrl+C
  or SIGTERM unmount it and give the terminal back; the daemon keeps running.

## Daemon startup

`src/daemon/daemon.ts`, `startDaemon()`:

1. `AtomicCore.create({ ownerScope: 'cli', dataFolder, controlPort, env, logger, telemetry: { host: 'atc',
   hostVersion, enabled? } })` — takes `instance.lock`, writes `control-token`, starts the control API.
   `enabled` is passed only when the person chose (`--telemetry`, or `telemetry.enabled` set in the
   config); otherwise the core's own precedence applies (`DO_NOT_TRACK`, `ATOMIC_CORE_TELEMETRY`, its
   stored consent, then on). `src/telemetry/`.
2. `RelayHub` (the admin's event ring) and the daemon's own `HttpCoreLink` over a `CoreClient` with the
   facade's token and `InProcessEvents` (the emitter, not SSE to itself). The facade exposes no hardware,
   backends, disk or environments methods, so the daemon calls its own core over loopback for those.
3. `HostStepExecutor` is wired: every core event is republished to the relay; `environment:operation`
   events go to the executor; a 2-second timer polls for results of manual steps.
4. Hardware push: `probeHardware` (`nvidia-smi`, `/proc/cpuinfo` / `sysctl` / `Win32_VideoController`)
   → `PUT /hardware/override { gpus, cpu_extensions, os_type, source: 'atc-prober' }`. The core never
   probes GPUs itself and does not persist the override, so this runs on every start (and on
   `atc hardware refresh`, iteration 4). A failed probe is a warning: the core will pick a CPU engine.
   This is transitional: the hardware facts and the choice of engine build belong to the core, and a core
   branch moves the probe there; `atc` then stops pushing and only shows what the core found.
5. Admin, unless `--no-admin` or `admin.autoStart=false`: `ensureAdminToken`, then `AdminServer.start` on
   `admin.host:admin.port`. A non-loopback host is refused (`ATC_ADMIN_BIND_FAILED`, iteration 5).
6. `writeDaemonRecord(atc/run/daemon.json)` — from now on commands accept this owner as an `atc` daemon.
7. `runDaemon` prints the core's ready line plus `admin_url` as one JSON line on stdout, then waits on
   `Promise.race([io.waitForShutdown(shutdown), core.stopped])`. Shutdown: `core.shutdown()`, stop the
   poll, unsubscribe, close the admin, remove `daemon.json` (only if it is still ours), exit 0.

Logging: the server's logger writes `daemon.log` through `fileSink` (text lines, `log.level`,
rotation by `log.maxSizeMb`/`log.maxFiles`); `start --foreground` also sends every line to stderr, for
journald, launchd and `docker logs`. `atc logs` and the TUI read the tail across `daemon.log.1` and follow
the file through a rotation by its identity (dev and inode), so no line is lost or read twice. When the
server is not running, `atc logs` also prints what its last start wrote to `daemon.out.log`.

Not done here: auto-starting the public API and `models.autoLoad` (iteration 2).

## The admin security model

`src/admin/`. The browser is the least trusted party; the daemon is the only holder of the control token.

- **Login.** `atc admin` prints `http://127.0.0.1:1338/#token=<admin-token>` and opens it. The SPA posts the
  fragment once to `POST /api/session { token }` (constant-time compare) and gets an `atc_session` cookie:
  `HttpOnly; SameSite=Strict; Path=/`, in-memory, 24 h idle expiry, all sessions gone on restart. The
  token never appears in a query string, a `Referer` or a log. `Authorization: Bearer <admin-token>` is
  accepted too, for scripts and tests. `atc admin token --rotate` replaces the token.
- **Gates** (`gates.ts`, before any handler, in the control server's style): peer address must be loopback
  (403), `Host` must be a loopback name — DNS-rebinding defence (421); a mutating request must carry
  `X-Atc-Admin: 1` and an `Origin` equal to our own `Host` (403) — a cross-site form or fetch has neither.
  Bodies are capped at 8 MiB. The SPA is served with `Content-Security-Policy: default-src 'self'`.
- **Routes** (`bff.ts`): `GET /api/status`, `POST|DELETE /api/session`, `GET /api/config` (`PATCH` is
  iteration 5), `GET /api/events` (SSE), `ANY /api/core/*` → the control API with the daemon's token, but only
  on the allowlist: reads of `/health /snapshot /sessions /server /backends /hardware /environments
  /settings /telemetry /disk` and their sub-paths; writes only on the exact routes of `WRITE_ROUTES` (model
  load/unload, server start/stop, backends, hardware override, `PATCH /settings/:provider`, environment
  operations, download cancel, disk, GGUF validation). A page can never post a host-step receipt. `/shutdown`, `/clients`, telemetry consent and
  cloud keys are never reachable from a page. `/api/setup/*`, `/api/logs`, `/api/engines/:p/schema` answer
  501 until their iterations.
- **Events** (`relay.ts`): one stream for the browser — the core's events plus `atc:*` — numbered `r<n>` by
  the relay; `Last-Event-ID` resumes from a 1000-entry ring, older cursors get a `resync`; `: ping` every 15 s.
- **Not on loopback.** `--host 0.0.0.0` / `admin.host` is refused until the password login with rate
  limiting lands (iteration 5); the hint is `ssh -L 1338:127.0.0.1:1338 user@server`. TLS is later still.

## Managed runtimes: host steps and elevation

The core (branch `feat/tenzor-rt`) does everything for a managed runtime — probe, plan, image pull, WSL
import, containers, recovery — except the one privileged step, which it hands to its host as
`pending_host_step { step_id, action, recipe_id, recipe_digest, parameters_digest, nonce,
expected_operation_revision }` and expects back as a `ManagedHostReceipt` on
`POST /environments/operations/:id/host-step-result`. It re-probes before believing the receipt. `atc` is
that host (ADR 2026-09-24 "The CLI is the host for managed runtimes").

Flow, in `src/host/host-step.ts` and `elevator.ts`:

1. The daemon sees `environment:operation`. The executor acts only when `pending_host_step` is set **and**
   `operation.instance_id === core.instanceId` — a desktop app's core owning the same operation must not
   trigger a second prompt.
2. Checks: `action ∈ MANAGED_HOST_ACTIONS` (`linux.install-container-runtime`, `windows.enable-wsl`),
   `expected_operation_revision === operation.revision`, `sha256:` digests, a nonce. A failed check is
   logged and the step is refused.
3. `<step_id>.request.json` is written, and a journal entry `requested` **before** anything runs. A crash
   between the helper and the receipt is repaired from the journal on the next start rather than repeated;
   the core classifies a duplicate by nonce.
4. `Elevator.select(context)` picks a strategy (table below); `Elevator.run` executes it. `root` runs
   `atc host-step exec <request>` directly with inherited stdio; `manual` returns instructions.
5. The helper reads only the file, runs the recipe, writes `<step_id>.result.json { outcome, exit_code,
   log_tail }` and exits. It never opens the control API: a sudo process needs no user token, cannot mix up
   the data-folder root, and receipts have exactly one writer (the daemon).
6. The daemon maps the result to a receipt (journal `ran` → `posted`). A `manual` step stays
   `pending-manual`: `atc status` and the admin's `pending_host_steps` show the exact command
   (`sudo atc host-step exec <file>`), and the 2-second poll posts the receipt when the result file appears.
7. `relogin-required` / `reboot-required` persist nothing extra: the core holds the phase; `atc engines
   install --resume <op>` posts `…/resume` (iteration 4).

| Strategy | Chosen when (first match) | Runs | Status |
| --- | --- | --- | --- |
| `root` | euid 0, or an elevated Windows process | the helper directly | works |
| `pkexec` | the daemon, on Linux, with `DISPLAY`/`WAYLAND_DISPLAY` and `pkexec` on PATH | `pkexec atc host-step exec …` (a polkit agent prompts; exit 126 is a declined prompt) | works |
| `windows-runas` | Windows, in the daemon or with a terminal | `Start-Process -Verb RunAs -Wait` (UAC; "canceled by the user" is declined) | works |
| `sudo-tty` | a command (not the daemon) with a terminal and `sudo` | `sudo -k -- atc host-step exec …`, stdio inherited for the password | works |
| `manual` | anything else — a headless daemon without a display, no sudo | nothing; the request file stays and the command is printed | works |

`root` clears an inherited `SUDO_UID`/`PKEXEC_UID`, so the executor trusts the folder this root process
created. A strategy that ends with no result file reports `declined` (the person dismissed the prompt) or
`failed`. The helper (`src/host/helper.ts`) runs the core's own executor (`executeHostStep` from
`@atomic-chat/core/host`, the code the desktop app runs): it refuses a request whose recipe, digests or
parameters do not match this build, trusts only a request folder owned by the invoking user with mode
0700 (on Windows, an owner-only ACL — which `<data>\atc` has), and writes the result file. The daemon writes
`parameters` into the request verbatim, creates the folder 0700 and the file 0600, and forwards the
result's `log_tail` in the receipt, which the core turns into the error's details on a failure. The
contract types are the core's (`src/host/managed-types.ts` re-exports them).

## The core's role, atc's role

| Concern | The core (`atomic-chat-core`) | `atc` |
| --- | --- | --- |
| Engines | Engine builds: catalog, hardware tiers, install, update, the optimal-build choice; starting each engine the way it runs (a process, or a container for a managed engine). | Asks (`atc engines`, iterations 2 and 4); pushes hardware facts until the core probes them itself. No engine ships in the binary. |
| Models | `model.yml`, registry, GGUF metadata, sessions, load/unload; HF catalog helpers; compatibility verdicts and Bonsai families. It downloads no model files (0.17.0). | Downloads every model itself (`src/downloads/`) and runs GGUF setups in the server's workspace (`<atc>/model-setups/`): plan, PrismML build through the core, download, `model.yml`, verdict by `model_id`. |
| Public API | The `/v1` server, its settings (`server.api_key`, `enable_on_startup`). | Where and how to expose it: `api.*` config, `atc api` (iteration 2). |
| Environments | The managed-runtime state machine, store, image pulls, WSL import, recovery. | Consent UI and the privileged step (above). |
| Settings | Engine parameters (`GET/PATCH /settings/:provider`), telemetry consent. | `atc`'s own `config.json`; `config set telemetry.enabled` also reaches a running core (`PUT /telemetry`). |
| Ownership | The lock, the token, attach semantics, client leases, shutdown. | `daemon.json` to tell an `atc` daemon from the core's CLI daemon; spawn with a log file. |

The rule in `AGENTS.md` §8 follows from this table: `atc` never copies core logic; a missing capability is
an export request in the core branch.

## What is stubbed

`src/cli/not-implemented.ts` is the registry: `PLANNED` maps each stub command to an iteration, and
`PLANNED_PARTIAL` names the stubbed features of working commands (`logs --follow`, `update apply`,
`config engine.*`, `host-step recipes`). A unit test keeps the registry and the command tree in agreement,
and `docs/commands.md` (generated) shows the status of every command. The iteration map: **I2** a first
model answering (`engines install`, `models pull`, `run`, `unload`, `api start|stop`, `start
--foreground`); **I3** the catalog, resumable pulls, model management and API keys; **I4** engines and
hardware from the core, the managed runtime, elevation; **I5** admin pages (API, models, engines) and
non-loopback consent; **I6** service, update apply, doctor completion; **I7** the admin's engine install
wizard, logs, settings, hardware; **I8** signing and notarisation. The terminal UI shipped early and gains
a screen per iteration.
