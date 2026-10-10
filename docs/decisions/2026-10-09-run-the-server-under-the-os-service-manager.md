---
date: 2026-10-09
title: "Run the server under the OS service manager"
---

# 2026-10-09 — Run the server under the OS service manager

- **Context:** A server that crashed stayed down until someone ran another `atc` command; `atc service`
  and `atc start --foreground` were stubs, and the unit templates called the stub. The launchd template
  had `KeepAlive true`, which would bring the server straight back after `atc stop`.
- **Decision:** `atc start --foreground` runs the server in place (the code the hidden `atc daemon`
  runs), refusing when a server of this build already owns the folder and replacing one of another
  build. `atc service install|uninstall|status|start|stop|restart` registers it with systemd (user unit,
  or system unit with `User=`), launchd (LaunchAgent, or LaunchDaemon with `UserName`) or Task Scheduler
  (logon task, or boot task as SYSTEM). Every manager restarts only after a failure, so `atc stop`
  (exit 0) keeps the server stopped. The Windows task is registered from XML, the only route that turns
  off the 72-hour execution limit and sets a restart on failure. The steps are pure plans
  (`service-plans.ts`) run by a small runner over injected `exec` and files.
- **Consequences:** Crashes are recovered by the OS; the server starts at boot or logon. `atc update`
  can restart the service after replacing the binary. A system-wide service needs root (an elevated
  shell on Windows) and runs as another account, so the data folder is passed explicitly and the user
  must own it. Windows restarts only after a failed exit, and a logon task needs an interactive session:
  a headless Windows server should use `--system`. The real-manager e2e (`test/e2e/service.test.ts`)
  runs only with `ATC_E2E_SERVICE=1`; on CI Linux it gates the build, macOS and Windows report only until
  they are proven on the runners.
- **Alternatives:** A Windows service wrapper (WinSW, NSSM, our own SCM shim): a second binary or a
  dependency to ship and sign, for a server that Task Scheduler can supervise. `schtasks /Create` with
  flags: no way to drop the 72-hour limit. `ExecStop=atc stop` in the unit: refuses while clients are
  attached, and SIGTERM already stops gracefully.
- **Owner:** `team`.
- **Links:** `src/host/service-manager.ts`, `src/host/service-plans.ts`, `src/commands/service.ts`,
  `src/commands/lifecycle.ts` (`startInForeground`), `test/contract/service.test.ts`,
  `test/e2e/service.test.ts`, `test/e2e/cli.test.ts`.
