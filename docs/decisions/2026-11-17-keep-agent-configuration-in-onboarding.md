---
date: 2026-11-17
title: "Keep agent configuration in onboarding"
---

# 2026-11-17 — Keep agent configuration in onboarding

- **Context:** Choosing to connect an agent completed setup and opened Overview, where the user had to find and select the agent again.
- **Decision:** Open the existing connection guide at the agent picker in both clients. Keep the final onboarding step visible behind the guide and return to it on Back. Run the existing configuration flow when the user chooses to configure the selected agent.
- **Consequences:** The guide retains the selected model and provider. When a download is pending, the existing waiting screen still offers an explicit exit. Continuing after the model is ready opens the agent picker directly.
- **Alternatives:** Automatically opening the dashboard's agent guide would finish onboarding before the user chose an agent and make it harder to return to the connection choices.
- **Owner:** team
- **Links:** [Web onboarding](../../packages/admin-ui/src/workspace/setup/SetupWizard.tsx), [terminal connection step](../../src/tui/workspace/setup/connection-choice.ts).
