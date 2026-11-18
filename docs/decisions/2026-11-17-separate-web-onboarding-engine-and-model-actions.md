---
date: 2026-11-17
title: "Give web onboarding one active engine or model step"
---

# 2026-11-17 — Give web onboarding one active engine or model step

- **Context:** Returning from first-model selection showed the engine chooser over a still-visible catalog. FastFlowLM and GenieX shared the Catalog's inline download view, so their review appeared below the wizard's forward action. Closing engine settings left the model review with the compatibility verdict it had read before setup.
- **Decision:** Show the engine chooser as a full-page step and retain the model view in memory so dismissing the chooser restores the selection. Open FastFlowLM and GenieX reviews with the same dialog frame as other variant engines. After engine settings close, re-read the selected model's compatibility and keep the chosen variant if still available.
- **Consequences:** The engine chooser reports an active FastFlowLM build as installed. The model review uses the core's variant verdict to decide whether to offer setup or download. Catalog rows keep their inline controls.
- **Alternatives:** Keeping the runtime model review inline would require integrating variant selection, setup and download into the first-model footer and displacing the catalog on short windows.
- **Owner:** team.
