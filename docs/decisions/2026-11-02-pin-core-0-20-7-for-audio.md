---
date: 2026-11-02
title: "Pin core 0.20.7 for audio"
---

# 2026-11-02 — Pin core 0.20.7 for audio

- **Context:** Core 0.20.7 publishes the audio API and engine registry, including fixes for cancellation, unload and model replacement races. The audio branch had local contract copies and missing-route fallbacks for core 0.20.5. Main now uses the unified model catalog and verifies artifact metadata at immutable Hub revisions.
- **Decision:** Pin the released core exactly, re-export its audio contracts and use its engine registry and routes directly. Remove the temporary audio availability flag and client filtering. Keep the separate audio catalog and its override alongside main's unified catalog; audio plans also carry source provenance and pass the shared Hub metadata verification before installation.
- **Consequences:** Both clients offer audio before their first status snapshot. Unexpected audio route errors are visible as workspace errors rather than silently disabling the feature. The real-core contract covers the unloaded audio API without installing an engine; studio cancellation recovery remains covered with fakes. Model downloads refuse inconsistent metadata before transferring model bytes.
- **Alternatives:** Keeping local type copies risks drift from the released API. Retaining missing-route detection would hide a broken integration with the now-required core. Moving audio into the unified catalog is a separate catalog migration and is not needed to resolve this merge.
- **Owner:** team.
- **Links:** [atomic-server#58](https://github.com/AtomicBot-ai/atomic-server/pull/58), [core v0.20.7](https://github.com/AtomicBot-ai/atomic-chat-core/releases/tag/v0.20.7), `src/contract/audio.ts`, `test/contract/audio-core.test.ts`.

<!-- Supersedes: 2026-11-01-add-audio-cpp-before-the-core-pin.md -->
