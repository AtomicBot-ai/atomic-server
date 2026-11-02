---
date: 2026-11-02
title: "Restore selected local models when finishing setup"
---

# 2026-11-02 — Restore selected local models when finishing setup

- **Context:** On-device onboarding saved a model ID but bypassed download completion, which previously owned automatic loading. The server panel only knew running models and download records. API buttons also shared the busy lock of unrelated model operations and waited for polling to show their result.
- **Decision:** Publish the saved engine/model selection in the shared snapshot. On first onboarding completion, load an installed saved model through the existing serialized `models.load` operation and start the API. Explicit API starts from the control panel may request `restore_selected`, including when the listener is already running. Give terminal API transitions their own lock, focus the stop confirmation, and refresh status immediately after each operation.
- **Consequences:** Web and TUI reuse local models without a download record. Missing or still-downloading models retain their existing setup flow. A failed local load leaves onboarding unfinished and exposes the error for retry. Stop remains available during unrelated work. Models and builds remain owned by the core.
- **Alternatives:** A terminal-only fallback would leave Web and shared state inconsistent. Starting the API without loading the selected model would leave the reported failure unresolved.
- **Owner:** Valera Brizhatiuk (@plombeer31).
- **Links:** `src/workspace-service/server-selection.ts`, `src/workspace-service/server-operations.ts`, `src/tui/workspace/server/api-actions.ts`.
