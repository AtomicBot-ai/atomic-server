---
date: 2026-11-17
title: "Open web onboarding at the first action"
---

# Open web onboarding at the first action

- **Context:** The welcome page required a click after the startup check had already determined which setup step was needed.
- **Decision:** Open the model step when an engine is active and the engine chooser otherwise. Show a status while checking setup and keep the connection retry on failure.
- **Consequences:** The initial chooser has no Back action. The chooser opened from model selection still returns there. Existing setup and download records still determine where to resume.
- **Owner:** team.
