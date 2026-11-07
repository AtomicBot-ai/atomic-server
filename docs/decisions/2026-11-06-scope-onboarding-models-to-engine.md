---
date: 2026-11-06
title: "Keep onboarding models and installation on the selected engine"
---

# Keep onboarding models and installation on the selected engine

- **Context:** onboarding saved engine/build IDs, but variant catalog routing expected a bare engine ID. FastFlowLM could therefore display GGUF recommendations. MLX was absent from the fresh chooser, the TUI's model step used a GGUF-only client catalog, and web managed installation could select a different installed engine.
- **Decision:** normalize non-llama.cpp selections to their engine before routing. Use each variant or managed engine's own catalog; use the server catalog and existing model-engine filters for stock GGUF, TurboQuant, Prism and MLX. Both clients respect the core's installed-model provider list, including an explicitly empty list. Variant families match exact installed variant IDs.
- **Installation:** offer available MLX builds and install its complete checkpoints through the existing artifact queue. A stable request ID derived from the plan digest makes returning to the model step or retrying a lost response resume the same job. Keep a chosen managed engine fixed; explain incompatibility and offer a return to model selection instead of silently switching engines.
- **Navigation:** closing the engine requirements panel before first-model selection returns to the original intro engine chooser. Discard the panel and unfinished model selection, preserve other onboarding state, and read the persisted engine again before resuming the model step. A new choice must not inherit the previous engine's setup; closing a panel never approves or cancels server-owned installation work.
- **Consequences:** recommendations and download execution agree. Native readiness and compatibility remain the core's responsibility. Uninstalled panel-only engines still require their existing setup/consent flow. No engine or model is installed merely to inspect recommendations.
- **Alternatives:** copying a generic GGUF catalog into every path masks unavailable engine-specific models. Inferring installed compatibility from an old provider label can contradict an authoritative empty provider list.
- **Owner:** team.

## Web engine setup and return navigation

Use one engine chooser for the intro and the first-model step. Offer registered managed engines before installation; their core plan explains hardware blockers and required consent. Only a ready runtime offers **Choose models**, which saves the engine selection before opening its catalog. Returning from models opens the chooser over the existing wizard so Back/Escape preserve the model choice; closing an engine panel returns to its caller without cancelling background work. Hold dismissal only during the short selection/continuation request, preventing a late response from navigating after Back.

When model review opens an engine panel, closing it increments the review revision and rechecks compatibility. Installation offers respect the chosen engine even when another compatible engine is already installed. Do not route a model through a different engine implicitly. Core readiness, installation, and model plans remain authoritative.
