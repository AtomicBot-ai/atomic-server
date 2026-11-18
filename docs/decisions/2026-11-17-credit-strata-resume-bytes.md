---
date: 2026-11-17
title: "Pass reusable Strata staging bytes to the core"
---

# 2026-11-17 — Pass reusable Strata staging bytes to the core

- **Context.** The normal compatibility check can refuse a resumed transfer when only the remaining sources fit on disk.
- **Decision.** After a disk refusal, count reusable staged bytes for the same pinned job and request a fresh compatibility check with `staged_bytes`. Count only durable ranges, matching single-stream partials, and hash-verified complete files.
- **Consequences.** The core keeps responsibility for preparation space and memory decisions. The pinned core 0.24.2 retains its original refusal until a release supports this field.
- **Alternative.** Counting the length of a sparse file could credit bytes that the downloader would still have to write.
