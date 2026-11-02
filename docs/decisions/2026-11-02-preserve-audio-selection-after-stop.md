---
date: 2026-11-02
title: "Preserve audio selection after Stop"
---

# 2026-11-02 — Preserve audio selection after Stop

- **Context:** Cancelling audio stops the engine process but keeps the core's model spec for the next job. Status then reports `loaded: null`: the studio discarded the model and draft, and a music or effects request without a duration lost its catalog default. Explicit unload also reports `loaded: null`, but clears the spec.
- **Decision:** Use the core's retained `audio.capabilities.modelId` when no resident model is reported. The studio keeps its draft while that identity stays the same and checks fresh snapshots for an explicit unload (`MODEL_NOT_LOADED`). Duration lookup uses the same identity to read the downloaded plan's catalog default; unexpected capability failures propagate rather than silently selecting another duration.
- **Consequences:** Stop and a recoverable engine failure preserve the model's form and allow another job to restart its process. An explicit unload clears the selection. Recovery needs a capabilities read when the process is absent; model files, the core pin and its lifecycle remain unchanged. Regression tests cover cancellation, reopening the studio and explicit unload. ARM CI tests wait for the engine worker's core request and publish the fake core's progress event instead of relying on scheduling and stale snapshots.
- **Alternatives:** Keeping the last model unconditionally would leave a stale selection after another client unloaded it. Copying the core's retained spec into the workspace would duplicate lifecycle state. Always using the fallback duration would change Stable Audio's catalog default from five seconds to ten after Stop.
- **Owner:** team.
- **Links:** https://github.com/AtomicBot-ai/atomic-server/pull/58, `src/workspace-service/audio/audio-duration.ts`, `packages/admin-ui/src/workspace/media/useAudioSelection.ts`.
