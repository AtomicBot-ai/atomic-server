---
date: 2026-11-17
title: "Journal Strata acquisition and guard model replacement"
---

# 2026-11-17 — Journal Strata acquisition and guard model replacement

- **Context.** A Strata model needs a pinned input set and a separate runtime preparation that can outlive an admin or CLI connection.
- **Decision.** Keep the reviewed descriptor and request ID in the server's setup journal. Publish only verified source files. Reuse the core's preparation operation and its revision across client reconnects. When replacing sources, hold the core maintenance guard and keep a backup until the new preparation succeeds or the previous installation is restored.
- **Consequences.** An interrupted transfer resumes with the original hashes. If the core cannot confirm that preparation stopped, the server keeps the guard and both sets of files for recovery. A local import is copied, so deleting an installation never removes its source directory.
- **Alternative.** Writing downloads into an installed model directory would let a concurrent load observe mixed source sets and would leave nothing to restore on a failed update.
