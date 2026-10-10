---
date: 2026-10-09
title: "Replace a server another build left running"
---

# 2026-10-09 — Replace a server another build left running

- **Context:** An update replaces the `atc` binary while the server it started keeps running. The
  core attaches only to an owner of its own version: `attachToOwner` throws `CORE_PROTOCOL_MISMATCH`,
  and with `launch: false` — the only way `atc` calls it — it never reaches the core's own
  `replaceIdleDaemon`. Every command (`status`, `start`, `stop`, `restart`, the terminal UI) failed with
  that error, `stop --kill` needed an attached link first, and the only way out was a manual `kill`.
- **Decision:** `atc` reaches the old owner itself (`src/core-link/stale-owner.ts`). The control API
  checks only loopback, `Host` and the bearer token, not the client's version, so with the lock record
  and the control token `atc` takes a snapshot, checks the instance and the attached clients, posts
  `/shutdown` and waits for the lock; `--kill` ends the pid the lock names (the core has already checked
  its identity). An owner speaking another control protocol is never spoken to over HTTP, only killed
  with `--kill`. Commands without `launch` report `ATC_DAEMON_OUTDATED`; `atc status` shows the server
  as `outdated` with exit 0; `start`, `restart` and any command that launches replace it, refusing while
  other clients are attached unless `--force`. The core's `replaceIdleDaemon` is not exported, and
  `atc` must spawn its own daemon (log file, `daemon.json`) anyway, so it is not reused.
- **Consequences:** The second release onward can update without a manual kill; `atc update` (apply)
  and the OS services restart through this path. A server is now also stopped by a newer `atc` that
  embeds a newer core, as long as the protocol is 2. Found on the way and fixed: `atc restart --json`
  printed two documents and failed; a server that died while starting surfaced as "cannot reach the
  core" and now is `ATC_DAEMON_START_FAILED` with the log's last lines; a SIGTERM during startup killed
  the process with Node's default handler and left `daemon.json` behind — `runDaemon` now listens
  before starting and shuts down once started.
- **Alternatives:** Ask the core to export `replaceIdleDaemon` — it would still not spawn an `atc`
  daemon and refuses any attached client with no `--force`. Kill by pid from `daemon.json` always —
  loses the graceful unload of models.
- **Owner:** `team`.
- **Links:** `src/core-link/stale-owner.ts`, `src/core-link/attach.ts`, `src/commands/lifecycle.ts`,
  `src/daemon/daemon.ts` (`runDaemon`), `test/contract/daemon-upgrade.test.ts`,
  `test/helpers/fake-old-owner.ts`, `test/e2e/cli.test.ts`.
