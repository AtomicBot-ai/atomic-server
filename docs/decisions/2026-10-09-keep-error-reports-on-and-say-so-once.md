---
date: 2026-10-09
title: "Keep error reports on and say so once"
---

# 2026-10-09 — Keep error reports on and say so once

- **Context:** `telemetry.enabled` defaulted to true and `atc` always passed it to the core, so the
  default overrode the core's own precedence — `DO_NOT_TRACK`, `ATOMIC_CORE_TELEMETRY`, the consent the
  core stores. Nothing told the person that reports go out, and `atc config set telemetry.enabled false`
  reached a running server only at its next start.
- **Decision:** Reports stay on by default (owner's call). `atc` passes the consent only when the person
  chose (`--telemetry`, or `telemetry.enabled` set in the config); otherwise the core decides. The first
  `atc start` (stderr) or terminal UI (status line) of a data folder shows the notice once, through the
  core's `takeFirstRunNotice`, which records it and stays silent when the environment or a stored
  consent already decided or the build reports nowhere. `config set telemetry.enabled` also sends
  `PUT /telemetry` to a running server. The README has a Privacy section.
- **Consequences:** `DO_NOT_TRACK=1` now works for `atc` as documented by the core. A `config unset` of
  the key applies at the next start. The notice is text in `atc`, since the core's names its own CLI.
- **Alternatives:** Ask for consent at first run — rejected by the owner; off by default — almost no
  reports.
- **Owner:** `team`.
- **Links:** `src/telemetry/notice.ts`, `src/daemon/daemon.ts`, `src/commands/config.ts`,
  `src/commands/lifecycle.ts`, `src/commands/tui.ts`, `test/contract/commands.test.ts`.
