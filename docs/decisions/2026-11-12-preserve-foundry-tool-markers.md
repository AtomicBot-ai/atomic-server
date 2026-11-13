---
date: 2026-11-12
title: "Preserve Foundry Local tool markers"
---

# 2026-11-12 — Preserve Foundry Local tool markers

- **Context** — The Microsoft resolver publishes the opening and closing tool markers per model variant. The server download plan kept the tools flag and reasoning markers but dropped the tool marker pair, so a chat request with tools could fail even when plain chat worked.
- **Decision** — Carry a complete resolver pair into the download plan and write it to the Foundry model record through the core serializer. Pin core 0.23.4 so the embedded host can recover markers for existing installations and apply the shared model-specific tool fixes.
- **Consequences** — New downloads retain the catalog metadata. Existing models can use the core fallback without downloading weights again. The optional fields keep older download plans readable.
- **Links** — [Core tool-calling fix](https://github.com/AtomicBot-ai/atomic-chat-core/pull/105)
