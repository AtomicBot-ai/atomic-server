---
date: 2026-11-07
title: "Track web engine installation through its server job"
---

# 2026-11-07 — Track web engine installation through its server job

- **Context:** An enqueue response only acknowledges a request; it does not mean installation finished. The web engine panel unlocked Install immediately, lost errors on reopen, and mixed hardware preparation with installation and inference settings.
- **Decision:** Keep pending requests and acknowledged queue receipts in a shared, execute-scoped store. Follow server job phases through completion; ignore older snapshots when a retry reuses its job ID. Retry failed queue jobs through the queue, including Foundry and LiteRT. Keep hardware action errors distinct from runtime installation errors while sharing the mutation lock. Managed engine consent remains bound to the core plan.
- **Presentation:** Use a common installation summary and primary action, a separate hardware section, and a disclosure for installed versions. Keep inference settings on their own tab with aligned label/control rows and a fixed save footer. Present managed plan requirements and resource estimates before consent; put its technical identifier in a disclosure. Use consistent 24px section gaps, 16px row spacing and 8px control gaps; stack controls on narrow screens.
- **Consequences:** Closing a panel no longer enables a second install. Download completion does not imply extraction or preparation completion. A failed queued runtime installation is retried through the same durable job; any remaining accelerator preparation is offered separately in the hardware section. Ordinary direct Foundry/LiteRT installs retain their automatic preparation. A full page reload restores queue state from the server, while transient request state lasts for the current workspace session.
- **Alternatives:** A local disabled flag loses state when the panel closes; a timeout can unlock before the engine finishes. Using the download percentage alone incorrectly implies completion while files are unpacking. Reinstalling the runtime on a hardware probe failure does not address the hardware problem.
- **Owner:** team.
- **Links:** [Earlier engine layout decision](2026-11-07-separate-engine-readiness-and-settings.md), `packages/admin-ui/src/workspace/library/engines/`.
