---
date: 2026-10-25
title: "Gate MCP connector programs behind --allow-exec"
---

# 2026-10-25 — Gate MCP connector programs behind --allow-exec

- **Context:** PR #14 added MCP connectors to the workspace. `connectors.save` stores a stdio connector's
  command, `connectors.check` starts it, `connectors.call` runs one of its tools. All were ordinary writes
  (`configure`, `generate`), so `atc mcp --allow-writes` let an agent run any program on the server's host
  without a person in the loop, and the child process inherited the server's whole environment (`HF_TOKEN`,
  `ATC_API_KEY`). The web and terminal UIs ask before a tool call; the server did not.
- **Decision:** A new operation effect, `execute`, for every operation that defines or runs a connector
  program (`connectors.save`, `connectors.import`, `connectors.check`, `connectors.call`). An MCP session
  offers them only with `--allow-exec` on top of `--allow-writes`, marks them destructive, and refuses a
  guessed name otherwise. A stdio connector's process gets the host basics (an allowlist by name, any case,
  including the proxy and certificate variables `npx` connectors need) plus its own `env`. Saving is gated with running because a saved command is what a person later starts
  with one click.
- **Consequences:** Existing `--allow-writes` sessions lose the connector tools until the operator adds
  `--allow-exec`. The admin and terminal UIs are the signed-in operator's and stay ungated. A connector
  that relied on an inherited variable must name it in its own `env`.
- **Alternatives:** Hiding connectors from MCP altogether (no agent could ever manage them); gating only
  `check`/`call` (an agent could plant a command for a person to run); a server-side approval token per tool
  call (a protocol of its own, left for later).
- **Owner:** team.
- **Links:** `src/agent-control/mcp.ts`, `src/contract/operations/features.ts`,
  `src/workspace-service/connector-stdio.ts`, `docs/agent-controls.md`.
