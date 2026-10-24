---
date: 2026-10-23
title: "Update the embedded core to 0.19.0"
---

# 2026-10-23 — Update the embedded core to 0.19.0

- **Context:** Both interfaces used core 0.18.5. The published 0.19.0 release adds LiteRT-LM, which starts this executable with `litert-host` for native probes and sessions.
- **Decision:** Pin `@atomic-chat/core` to 0.19.0 and dispatch the public `./litert-host` export before command parsing, as for Foundry Local. Keep the core's native loader in the compiled executable and use its existing generic engine operations.
- **Consequences:** The web UI and TUI use the updated backend. Rebuild before launching; an idle server from the old build is replaced on the next start. LiteRT model acquisition is not exposed in onboarding until the client implements that flow. Keep the existing Linux Foundry telemetry workaround because this release does not fix its underlying library crash.
- **Alternatives:** Bumping the dependency alone leaves LiteRT probes and sessions routed to an unknown CLI command. Copying its host implementation would violate the core boundary.
- **Owner:** team.
- **Links:** `src/bin.ts`, `test/e2e/litert-host.test.ts`, `docs/release.md`, [core 0.19.0](https://github.com/AtomicBot-ai/atomic-chat-core/releases/tag/v0.19.0).
