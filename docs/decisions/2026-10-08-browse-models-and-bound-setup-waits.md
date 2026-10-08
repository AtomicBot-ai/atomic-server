---
date: 2026-10-08
title: "Browse Atomic Chat models and bound setup waits"
---

# 2026-10-08 — Browse Atomic Chat models and bound setup waits

- **Context:** First-run onboarding started with a Qwen search, exposed only upstream llama.cpp and Atomic Prism, and waited on a model plan while disabling navigation. A slow metadata request could leave the file picker appearing stuck. File selection also required a separate review/start sequence.
- **Decision:** Open with the desktop's Atomic Chat staff-picks feed, backed by a bundled snapshot and a private local cache. Refresh without blocking browsing. Search is secondary and queries AtomicChat separately so its matching quants lead the results. Fetch every GGUF engine supported by Core's live advisor, including TurboQuant; explain the desktop-only runtime limitation for MLX and Apple Intelligence. File selection opens installation immediately, with a cancellable, bounded compatibility check before Core accepts durable downloads. Highlight the current step in bold and show explicit 1/2 intro shortcuts.
- **Consequences:** Browse remains usable offline, but model metadata and downloads still need a connection. A cached catalog is a discovery aid, not a compatibility guarantee: Core still validates actual files, requirements and disk space. Preflight cancellation discards late results; it cannot start a download afterward. Once transfers are accepted, Pause/Resume retains Core's durable-job semantics. A repeated start reuses the existing matching installation. The selected TurboQuant engine is configured and loaded rather than silently replaced with upstream. MLX/Safetensors, split GGUF shards and desktop-supplied Apple runtimes are not installed by this picker.
- **Alternatives:** Search-only navigation hid curated models and Atomic quants; blocking refresh made network latency look like an application failure. Installing desktop-specific runtimes without a Core installer would introduce an incomplete second engine manager.
- **Owner:** @plombeer31.
- **Links:** [Desktop staff picks](https://raw.githubusercontent.com/AtomicBot-ai/atomic-chat-conf/main/models/staff-picks.json), `src/terminal-setup/`, `src/tui/workspace/setup-actions.ts`, `test/contract/terminal-onboarding.test.ts`.

This changes the model-selection sequence in [the first-run setup decision](2026-10-08-gate-terminal-entry-on-real-model-setup.md). The durable installation and entry gate remain.
