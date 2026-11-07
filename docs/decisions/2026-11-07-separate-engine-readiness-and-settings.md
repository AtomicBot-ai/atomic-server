---
date: 2026-11-07
title: "Separate engine readiness from inference settings"
---

# 2026-11-07 — Separate engine readiness from inference settings

- **Context:** Foundry Local and LiteRT-LM onboarding discarded the catalog's device variants and planned the default immediately. Web variant menus mixed device names with long diagnostic messages. Engine dialogs mixed installation, accelerator preparation, diagnostics and inference parameters in one scrolling form.
- **Decision:** Show explicit device choices before planning either runtime's model. Keep short readiness labels alongside each choice and show the selected reason separately; the core remains authoritative for availability and installation plans. TUI requests retain their id across retries and advance onboarding only after the download is accepted and selection saved. Re-read verdicts after engine preparation. Web engine dialogs use Overview for builds and hardware, Settings for inference parameters, with persistent edits and a fixed header/action area. Diagnostic detail and settings transfer use disclosures; consent and driver instructions remain visible. TUI reads readiness, builds and provider settings concurrently; settings have their own loading, saving and error state, so hardware probes cannot block editing.
- **Consequences:** Foundry and LiteRT share device-choice presentation without sharing engine policy. Changing tabs does not discard edits or interrupt preparation. Setup must preserve the selected variant and reject stale asynchronous replies. Screens need both narrow-layout and light/dark checks; no hardware compatibility claim is derived from UI tests.
- **Alternatives:** Keeping a native select would retain unreadable option rows. Automatically choosing a variant hides meaningful CPU/GPU/NPU tradeoffs. Putting every control on one page prevents the user from distinguishing installation prerequisites from optional inference settings.
- **Owner:** team.
- **Links:** `src/tui/workspace/setup/variant-model-choice.ts`, `packages/admin-ui/src/workspace/library/install/VariantChoices.tsx`, `packages/admin-ui/src/workspace/library/engines/EngineSettings.tsx`.
