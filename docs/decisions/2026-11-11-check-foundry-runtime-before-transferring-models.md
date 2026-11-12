---
date: 2026-11-11
title: "Check Foundry Local runtime requirements before transferring models"
---

# 2026-11-11 — Check Foundry Local runtime requirements before transferring models

- **Context** — An Azure model revision can declare a minimum Foundry Local runtime. Server downloads can survive a restart or retry with a new SAS link, by which time the active runtime may have changed.
- **Decision** — Pin the published core 0.22.5 for its dual-ABI host and compatibility check. Send the resolved revision's minimum to the core during planning and before each transfer attempt. Keep the highest known minimum with the job alongside its existing revision, digest and resume keys. For an older core that explicitly rejects the new field, use its original verdict and the version of its active Foundry build. Offer an update only when the core lists a target that satisfies the requirement.
- **Consequences** — CLI, TUI and admin see the same blocker. The worker can reject a saved job before opening a transfer, then resume its partial bytes once the runtime is compatible. Existing installed models still open without resolving Azure metadata.
- **CLI compatibility** — The compiled runtime's argument parser needs a positive boolean entry to read an explicitly declared `--no-accelerators`. Provide that entry internally and reject the undeclared positive spelling so the public CLI stays the same.
- **Alternatives** — A plan-only check would miss old jobs and changes to the active runtime after planning. Replanning a saved job would consult the live catalog, which can point at a different revision.
- **Owner** — `team`.
- **Links** — OpenSpec `upgrade-foundry-local-2-4`, tasks 4.1–4.3.
