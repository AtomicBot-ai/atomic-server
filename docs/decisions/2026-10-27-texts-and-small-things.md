---
date: 2026-10-27
title: "Say things in atc's words, and show answers as text"
---

# 2026-10-27 — Say things in atc's words, and show answers as text

- **Context:** the third batch of 0.2.1/0.2.2 reports: the core's errors told an `atc` user to run
  `atomic-chat-cli models list`; `atc doctor` called an Apple M4 Max a machine with no GPU (the core lists
  none: the GPU shares the memory); eight commands printed JSON on a terminal without `--json`;
  `atc models list` showed no sizes although `model.yml` records them; the README called working
  commands stubs and listed a `logs/` folder the core does not create; the web admin called an API
  on loopback "Stopped" under "Local network", took a fifth of a phone's width for the rail, and the
  terminal UI's scroll tracks (`|`, `#`) sat in frame columns so frames looked half drawn. The 403 for a
  foreign `Host` names the desktop app's Settings menu; that text is the core's, on the public API
  atc does not touch (spec change `fix-public-api-trusted-hosts-hint`).
- **Decision:** a core error's text is rewritten to atc's commands before it is shown (`atcCommands`:
  `atomic-chat-cli models list` → `atc models list`, `serve` → `run`). The doctor's GPU line names
  Apple silicon and its unified memory when the core lists no GPU on macOS/arm64. `printOperation`
  renders an answer as text through `humanLines`: tables for a catalog, a search, files and any list
  of flat records; key/value lines for a plan, the hardware facts and any flat object; JSON only for
  what is deeper. Installed rows carry `size_bytes` from `model.yml`. "Local network" says the API's
  address and what it means (local only, listening on the network, stopped). Below 480px the rail is
  icons only (48px) and the sidebar a drawer. Scroll tracks use `│`/`┃`.
- **Consequences:** a command whose answer was JSON on a terminal now prints text; scripts must use
  `--json` (they always should have). Apple silicon's GPU line is inferred from the CPU facts, not
  reported by the core. A download's size is known for files with a size in the registry only.
- **Alternatives:** asking the core to rename its CLI in messages (slower; the rewrite is a table of
  two entries); a bottom tab bar on phones (a larger change to the shell than the batch warrants).
- **Owner:** `team`.
- **Links:** `src/errors/errors.ts`, `src/doctor/checks.ts`, `src/commands/server/human-output.ts`,
  `src/terminal-setup/catalog.ts`, `packages/admin-ui/src/workspace/server/RemoteAccess.tsx`,
  `packages/admin-ui/src/workspace/styles/desktop-parity.css`, `src/tui/workspace/draw/controls.ts`,
  `../atomic-chat-spec/openspec/changes/fix-public-api-trusted-hosts-hint`.
