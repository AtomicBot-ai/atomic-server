---
date: 2026-11-17
title: "Save dashboard exit without starting a model"
---

# Save dashboard exit without starting a model

- **Context:** Go to dashboard awaited the manual setup operation. When the selected model became available that operation could load the model and start the API before returning.
- **Decision:** Let manual setup callers pass `restore_selected: false` to record completion only. Use that option for the final web dashboard action. Callers that omit the option retain the existing restoration behavior.
- **Consequences:** Opening the dashboard waits for the setup record to be saved. Model downloads continue and the selected model is available for an explicit start from the dashboard.
- **Owner:** team.
