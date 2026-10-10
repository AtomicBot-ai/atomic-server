---
date: 2026-10-09
title: "Run host steps through the core executor"
---

# 2026-10-09 — Run host steps through the core executor

- **Context:** `atc host-step exec` answered every request with `MANAGED_ADAPTER_UNAVAILABLE`, its
  contract types were a copy of an old core branch, and only the `root` and `manual` elevations worked.
  The core `atc` embeds already ships the recipes (`linux.install-container-runtime`,
  `windows.enable-wsl`) and their executor, and its contract adds `parameters` to the pending step: the
  executor recomputes `parameters_digest` from them, and trusts only a request folder its invoking user
  owns with mode 0700. `atc` wrote neither, so every real step would have been refused.
- **Decision:** The helper calls the core's `executeHostStep` (with `nodeHostStepDeps` or
  `windowsHostStepDeps`), the code the desktop app runs. The daemon copies `parameters` into the request,
  creates the folder 0700 and the request 0600, and forwards the result's `log_tail` in the receipt. The
  types are re-exported from `@atomic-chat/core/contracts`. `sudo-tty` (`sudo -k`), `pkexec` and
  `windows-runas` (UAC through `Start-Process -Verb RunAs`) are implemented; a dismissed prompt is
  `declined`; `root` runs the helper without an inherited `SUDO_UID`/`PKEXEC_UID`.
- **Consequences:** A managed-environment setup started from the core can finish its privileged step on
  Linux and Windows. Starting one from `atc` (a command or a screen) is product work and not part of this.
  `managed.mode` still has no reader. The contract test runs the real executor as a normal user by
  simulating `sudo` (`SUDO_UID`); a step that changes the machine is covered only by the opt-in live tests
  (`ATOMIC_LIVE=1 ATOMIC_LIVE_MANAGED=1`, as in the core).
- **Alternatives:** Keep `atc`'s own executor: a second implementation of a privileged path. Gate the
  helper behind `managed.mode`: the core asks only after the person consented to a plan, so a second
  switch would only make the step hang.
- **Owner:** `team`.
- **Links:** `src/host/helper.ts`, `src/host/host-step.ts`, `src/host/elevator.ts`,
  `src/host/managed-types.ts`, `test/contract/host-step.test.ts`.
