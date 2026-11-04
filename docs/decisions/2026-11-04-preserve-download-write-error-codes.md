---
date: 2026-11-04
title: "Preserve download write error codes"
---

# 2026-11-04 — Preserve download write error codes

- **Context:** PR #77 inferred FAT32 whenever a write ending beyond 4 GiB failed with a full-disk or unknown I/O error. NTFS/ext4 writes can fail at the same offsets: free space can change after preflight, quotas need not match free space, and unavailable free-space information allows a download to proceed.
- **Decision:** Preserve the OS classification at every write offset. Only `EFBIG` becomes `disk_fs_limit`; `ENOSPC` and `EDQUOT` remain `disk_full`, and unknown errors remain `disk_io`. File-size advice describes a filesystem or process limit and mentions FAT32 conditionally. This supersedes the offset-based classification in `2026-11-04-pin-core-0-21-3.md`.
- **Consequences:** Both single-stream and ranged downloads retain actionable error tags and the original cause. Tests inject write failures across and beyond 4 GiB without allocating large files. FAT32 refusals exposed only as `ENOSPC` or an unknown code remain ambiguous; the server no longer asserts a filesystem type it has not detected.
- **Alternatives:** Probe the destination filesystem and its limits. That needs platform-specific evidence and is outside this correction; preflight free space and a write offset are insufficient substitutes.
- **Owner:** team.
- **Links:** [PR #77](https://github.com/AtomicBot-ai/atomic-server/pull/77), `src/downloads/disk.ts`, `src/downloads/write-failures.test.ts`.
