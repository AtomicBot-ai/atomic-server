---
date: 2026-10-27
title: "The server owns its start-up, its ports and a crashed model"
---

# 2026-10-27 — The server owns its start-up, its ports and a crashed model

- **Context:** 0.2.1 on macOS beside the Atomic Chat desktop app: `atc doctor` called 1337 free while the
  desktop served `0.0.0.0:1337` (BSD sockets let a loopback bind sit beside a wildcard listener), and
  `atc api start` then took the port's loopback traffic. `api.autoStart` and `models.autoLoad` were read
  by nothing. A model whose process died left no line in the log, was not loaded again, and llama.cpp's
  output went nowhere, so `atc models logs` had nothing for it. `models catalog --engine <x>` crashed for
  every engine without a descriptor, so MLX had no list to pull from in the CLI, and the web admin's Start
  led to the catalog instead of starting the API.
- **Decision:** a port is free only when every address that can shadow it (`0.0.0.0`, `::`, `127.0.0.1`,
  `::1`) binds; `startApi` (CLI and workspace alike) refuses a busy port with `ATC_PORT_BUSY` before the
  core binds. Once ready, the daemon starts the API when `api.autoStart` says so (before its ready record,
  so `atc start` shows the result) and loads `models.autoLoad` after it; each failure is a log warning, not
  a failed start. The daemon logs `session:died` and `session:unloaded`, hands the core's `backendOutput`
  to `atc/logs/engines.log` (rotated like the server log; `models.logs` reads it for engines without a
  container), and loads a model that died again, at most 3 times per model within 10 minutes. `catalog`
  and `search --engine` narrow the catalog for MLX and the llama.cpp family (the Local models filter's
  rule); `pull --engine mlx` and `run --engine mlx` use the artifact job the web admin and the terminal
  UI already use. The API serves without a model: no client gates `api.start` on a loaded model any more;
  what is still missing is a hint beside the Start.
- **Consequences:** test servers must not take 1337: `test/setup.ts` sets `ATC_API_AUTO_START=false`, and
  a test that builds its own config passes it too. A restart reloads with provider and model only (an
  embedding session comes back as chat); the restart limits are constants, not config. `engines.log`
  grows with every engine line and relies on `log.maxSizeMb`.
- **Alternatives:** probing with `exclusive`/`reusePort` flags (they do not change BSD's wildcard rule);
  a config switch for the restart policy (a schema bump for a rule nobody asked to turn off yet); keeping
  Start as a guide to the catalog (inconsistent with `atc api start` and the `api.autoStart` default).
- **Owner:** `team`.
- **Links:** `src/host/ports.ts`, `src/terminal-service/operations.ts`, `src/daemon/boot.ts`,
  `src/daemon/session-watch.ts`, `src/daemon/engine-log.ts`, `src/commands/models/engine-listing.ts`,
  `src/commands/models/mlx-commands.ts`, `src/workspace-service/snapshot/require-readiness.ts`.
