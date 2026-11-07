---
date: 2026-11-06
title: "Offer FastFlowLM before its first installation"
---

# Offer FastFlowLM before its first installation

- **Context:** the first engine chooser offered uninstalled llama.cpp builds but retained other engines only when installed. A fresh Linux profile could therefore install FastFlowLM from the library but could not choose it during onboarding.
- **Decision:** TUI and admin also offer the FastFlowLM build returned by core as `latest`. The existing server-owned engine queue installs it and records the selection. An absent build remains unavailable; installed engines retain their existing behavior. This installs the engine, not a model or privileged driver recipe.
- **Consequences:** first-run setup can start with FastFlowLM. The core remains responsible for runtime/NPU readiness and subsequent preparation; the client does not invent hardware facts or override the llama.cpp backend recommendation.
- **Queue contract:** an `engine-build` target is display/selection intent, not an update parameter. The server omits it from the core update, shares in-flight jobs by engine, and records the core's actual active build afterwards. Model setup checks the engine-build catalog rather than llama.cpp backends. This also repairs retries of persisted jobs created by the first onboarding implementation.
- **Alternatives:** requiring native readiness before listing an uninstalled engine would hide it again, because native readiness requires the engine itself. Automatically selecting ROCm in atc would duplicate core policy and hide missing dependencies.
- **Owner:** team.
