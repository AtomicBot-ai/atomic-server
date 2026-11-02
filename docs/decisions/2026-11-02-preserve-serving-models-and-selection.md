---
date: 2026-11-02
title: "Preserve serving models and effective selection"
---

# 2026-11-02 — Preserve serving models and effective selection

- **Context:** The onboarding download gate only exempted ready chat models, so new downloads stopped APIs serving audio, images or embeddings. Restoring a saved model also substituted the first provider for Prism/SGLang and discarded environment overrides when rereading config.
- **Decision:** Exempt every ready, loaded or running workspace service from the download gate. Restore a saved engine only when the installed model's provider list includes it; otherwise use the model's reported default provider. Reread config with the daemon's injected environment, retaining the priority of environment values over file edits.
- **Consequences:** Downloads keep serving workloads available without relaxing the first-download gate for an empty API. Web and terminal restoration share the same supported provider and effective model selection. Missing models retain their download flow, and an unsupported saved engine falls back to the core-reported provider.
- **Alternatives:** A chat-only exemption interrupts other public API workloads. Blindly trusting the saved provider can select an engine that cannot load the model. Reading only the startup config misses later terminal/CLI edits; rereading only the file loses environment precedence.
- **Owner:** team.
- **Links:** PR #69; `src/workspace-view/setup/api-download-wait.ts`, `src/workspace-service/server-selection.ts`.
