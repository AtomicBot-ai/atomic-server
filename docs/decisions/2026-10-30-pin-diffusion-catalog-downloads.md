---
date: 2026-10-30
title: "Pin diffusion downloads to each repository's commit"
---

# 2026-10-30 — Pin diffusion downloads to each repository's commit

- **Context:** Unsloth replaced Z-Image Turbo quantizations on `main`; Q4_K_M changed from 5,017,613,376 to 3,850,130,496 bytes. Conf retained the old size and hash, so integrity checks correctly refused the download.
- **Decision:** Read optional full-commit `transformer.revision` and side-file `revision` fields from diffusion schema version 1. Each entry uses its own repository's revision, never a transformer's commit for a dependency repository. Reject malformed explicit pins; retain `main` when absent. Conf updates Z-Image Turbo to Unsloth commit `b40f712c569ecfff42f2307dcc43399ae1d71318` and its byte counts and hashes.
- **Consequences:** Updated clients keep fetching the same bytes when upstream moves `main`. Revision changes alter the plan digest, so another plan cannot reuse an existing request ID. Older clients ignore pins until upgraded; corrected metadata alone repairs their current mismatch. Size and SHA-256 checks remain unchanged. No core or download-protocol change. Generation with the replacement files remains untested.
- **Alternatives:** A metadata-only repair breaks again on the next replacement. Keeping old files requires the same client support and does not repair released clients through conf alone. Disabling integrity checks would accept unintended files.
- **Owner:** team.
- **Links:** [Issue #41](https://github.com/AtomicBot-ai/atomic-server/issues/41), [Unsloth replacement](https://huggingface.co/unsloth/Z-Image-Turbo-GGUF/commit/b40f712c569ecfff42f2307dcc43399ae1d71318), `../atomic-chat-conf/models/schema.diffusion.json`, `../Atomic-Chat/docs/decisions/2026-10-30-pin-diffusion-catalog-downloads.md`.
